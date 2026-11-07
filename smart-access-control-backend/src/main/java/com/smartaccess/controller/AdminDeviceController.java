package com.smartaccess.controller;

import com.smartaccess.dto.manager.DeviceResponse;
import com.smartaccess.model.*;
import com.smartaccess.model.enumtype.*;
import com.smartaccess.repository.*;
import com.smartaccess.security.AccountPrincipal;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.security.SecureRandom;
import java.util.*;

@RestController
@RequestMapping("/api/admin/devices")
public class AdminDeviceController {
    public record Register(@NotBlank @Pattern(regexp = "[A-Za-z0-9_-]{1,64}") String deviceUid,
                           @NotBlank @Size(max = 100) String deviceName, @NotNull DeviceType deviceType) {}
    public record Lifecycle(@NotNull DeviceLifecycleStatus status) {}
    public record Provisioned(DeviceResponse device, String deviceSecret) {}
    private final DeviceRepository devices;
    private final AccountRepository accounts;
    private final AuditLogRepository audits;
    private final PasswordEncoder passwords;
    private final com.smartaccess.service.DecommissionNotifier decommissions;
    public AdminDeviceController(DeviceRepository devices, AccountRepository accounts, AuditLogRepository audits, PasswordEncoder passwords,
                                 com.smartaccess.service.DecommissionNotifier decommissions) {
        this.devices = devices; this.accounts = accounts; this.audits = audits; this.passwords = passwords; this.decommissions = decommissions;
    }
    @GetMapping @Transactional(readOnly = true)
    public List<DeviceResponse> list() { return devices.findAll().stream().map(DeviceResponse::from).toList(); }

    @PostMapping @ResponseStatus(HttpStatus.CREATED) @Transactional
    public Provisioned register(@AuthenticationPrincipal AccountPrincipal actor, @Valid @RequestBody Register request) {
        if (devices.existsByDeviceUid(request.deviceUid())) throw new ResponseStatusException(HttpStatus.CONFLICT, "UID đã tồn tại");
        Device device = new Device(); device.setDeviceUid(request.deviceUid()); device.setDeviceName(request.deviceName());
        device.setDeviceType(request.deviceType());
        String secret = newSecret(); device.setDeviceSecretHash(passwords.encode(secret));
        device.setBootstrapSecretHash(passwords.encode(newSecret()));
        devices.saveAndFlush(device); audit(actor, device, "REGISTER_DEVICE");
        return new Provisioned(DeviceResponse.from(device), secret);
    }
    @PostMapping("/{uid}/rotate-secret") @Transactional
    public Provisioned rotate(@AuthenticationPrincipal AccountPrincipal actor, @PathVariable String uid) {
        Device device = require(uid);
        if(device.getAccessUnit()!=null)throw new ResponseStatusException(HttpStatus.CONFLICT,"Dùng reset/chuyển giao có xác nhận; không đổi secret cửa đang có chủ");
        if (device.getLifecycleStatus() == DeviceLifecycleStatus.DECOMMISSIONED)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Thiết bị đã thu hồi");
        String secret = newSecret(); device.setDeviceSecretHash(passwords.encode(secret));
        audit(actor, device, "ROTATE_DEVICE_SECRET"); return new Provisioned(DeviceResponse.from(device), secret);
    }
    @PatchMapping("/{uid}/lifecycle") @Transactional
    public DeviceResponse lifecycle(@AuthenticationPrincipal AccountPrincipal actor, @PathVariable String uid,
                                     @Valid @RequestBody Lifecycle request) {
        Device device = require(uid);
        if (device.getLifecycleStatus() == DeviceLifecycleStatus.DECOMMISSIONED)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Thiết bị đã thu hồi vĩnh viễn");
        if (!com.smartaccess.service.DeviceLifecyclePolicy.allowed(device).contains(request.status()))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Chuyển trạng thái không hợp lệ; ACTIVE/PROVISIONED cần có chủ cửa");
        device.setLifecycleStatus(request.status());
        if (request.status() == DeviceLifecycleStatus.DECOMMISSIONED) {
            device.setDeviceSecretHash(null);
            notifyAfterCommit(device.getDeviceUid());
        }
        audit(actor, device, "DEVICE_" + request.status()); return DeviceResponse.from(device);
    }
    // Chỉ báo chip sau khi DB đã ghi thu hồi, để chip không bị xóa dữ liệu khi giao dịch rollback.
    private void notifyAfterCommit(String uid) {
        if (!org.springframework.transaction.support.TransactionSynchronizationManager.isSynchronizationActive()) {
            decommissions.notifyNow(uid); return;
        }
        org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(
                new org.springframework.transaction.support.TransactionSynchronization() {
                    @Override public void afterCommit() { decommissions.notifyNow(uid); }
                });
    }
    private Device require(String uid) {
        return devices.findByDeviceUidForUpdate(uid).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy thiết bị"));
    }
    private static String newSecret() {
        byte[] bytes = new byte[32]; new SecureRandom().nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
    private void audit(AccountPrincipal actor, Device device, String action) {
        AuditLog log = new AuditLog(); log.setActor(accounts.getReferenceById(actor.accountId()));
        log.setAction(action); log.setEntityType("DEVICE"); log.setEntityId(device.getDeviceId());
        log.setDetails(Map.of("deviceUid", device.getDeviceUid())); audits.save(log);
    }
}
