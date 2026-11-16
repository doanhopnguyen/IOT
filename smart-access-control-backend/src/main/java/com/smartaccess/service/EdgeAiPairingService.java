package com.smartaccess.service;

import com.smartaccess.dto.manager.EdgeAiResponse;
import com.smartaccess.model.*;
import com.smartaccess.model.enumtype.*;
import com.smartaccess.repository.*;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.security.SecureRandom;
import java.util.*;
import static org.springframework.http.HttpStatus.*;

/**
 * Bộ camera AI (laptop + webcam) chỉ có danh tính khi admin tạo trước và cấp mã ghép dùng một lần.
 * Chủ cửa phải có mã đó (cùng mật khẩu tài khoản) mới gắn được camera vào cửa; không còn tự cấp chỉ bằng mật khẩu.
 */
@Service @Transactional
public class EdgeAiPairingService {
    public record Kit(EdgeAiResponse device, String pairingCode) {}
    public record Issued(String deviceUid, String deviceSecret) {}

    private final DeviceRepository devices;
    private final AccountRepository accounts;
    private final AuditLogRepository audits;
    private final PasswordEncoder passwords;
    private final ManagerAccessGuard guard;

    public EdgeAiPairingService(DeviceRepository devices, AccountRepository accounts, AuditLogRepository audits,
                                PasswordEncoder passwords, ManagerAccessGuard guard) {
        this.devices = devices; this.accounts = accounts; this.audits = audits; this.passwords = passwords; this.guard = guard;
    }

    /** Admin: tạo bộ camera AI chưa gắn cửa, trả mã ghép đúng một lần. */
    public Kit createKit(Long adminId, String name) {
        if (name == null || name.isBlank() || name.trim().length() > 100)
            throw new ResponseStatusException(BAD_REQUEST, "Tên bộ camera AI cần 1-100 ký tự");
        Device d = new Device();
        d.setDeviceUid("FACE-" + UUID.randomUUID()); d.setDeviceName(name.trim());
        d.setDeviceType(DeviceType.FACE_CAMERA_NODE); d.setLifecycleStatus(DeviceLifecycleStatus.REGISTERED);
        String code = newCode(); d.setPairingCodeHash(DeploymentService.digest(code));
        devices.saveAndFlush(d);
        audit(adminId, d, "CREATE_EDGE_AI_KIT", Map.of("deviceUid", d.getDeviceUid()));
        return new Kit(EdgeAiResponse.from(d), code);
    }

    /** Admin: cấp lại mã cho bộ chưa ghép (mã cũ hết hiệu lực). */
    public Kit reissueCode(Long adminId, String uid) {
        Device d = devices.findByDeviceUidForUpdate(uid).orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Không tìm thấy thiết bị"));
        if (d.getDeviceType() != DeviceType.FACE_CAMERA_NODE || d.getAccessUnit() != null
                || d.getLifecycleStatus() != DeviceLifecycleStatus.REGISTERED)
            throw new ResponseStatusException(CONFLICT, "Chỉ cấp lại mã cho bộ camera AI chưa ghép và chưa bị tạm ngưng/thu hồi");
        String code = newCode(); d.setPairingCodeHash(DeploymentService.digest(code));
        audit(adminId, d, "REISSUE_EDGE_AI_CODE", Map.of("deviceUid", uid));
        return new Kit(EdgeAiResponse.from(d), code);
    }

    /** Chủ cửa: ghép bộ camera AI vào cửa của mình bằng mã ghép + mật khẩu tài khoản. */
    public Issued pair(Long ownerId, Long unitId, String pairingCode, String password) {
        Account owner = accounts.findById(ownerId).orElseThrow(() -> new ResponseStatusException(UNAUTHORIZED));
        if (password == null || !passwords.matches(password, owner.getPasswordHash()))
            throw new ResponseStatusException(FORBIDDEN, "Cần xác thực lại mật khẩu");
        AccessUnit unit = guard.requireManagedUnit(ownerId, unitId);
        String code = normalize(pairingCode);
        if (code.isEmpty())
            throw new ResponseStatusException(BAD_REQUEST, "Cần mã ghép bộ camera AI do admin cấp");
        if (code.length() > 128) throw new ResponseStatusException(BAD_REQUEST, "Mã ghép không hợp lệ");
        Device d = devices.findByPairingCodeHashForUpdate(DeploymentService.digest(code))
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Mã ghép không hợp lệ hoặc đã được dùng"));
        if (d.getDeviceType() != DeviceType.FACE_CAMERA_NODE || d.getAccessUnit() != null
                || d.getLifecycleStatus() != DeviceLifecycleStatus.REGISTERED)
            throw new ResponseStatusException(CONFLICT, "Bộ camera AI này không còn ghép được; liên hệ admin");
        boolean hasCamera = devices.findAll().stream().anyMatch(x -> x.getDeviceType() == DeviceType.FACE_CAMERA_NODE
                && x.getAccessUnit() != null && unitId.equals(x.getAccessUnit().getUnitId())
                && x.getLifecycleStatus() != DeviceLifecycleStatus.DECOMMISSIONED);
        if (hasCamera) throw new ResponseStatusException(CONFLICT, "Gỡ camera cũ trước khi ghép camera mới");
        String secret = UUID.randomUUID().toString() + UUID.randomUUID();
        d.setAccessUnit(unit); d.setDeviceSecretHash(passwords.encode(secret));
        d.setBootstrapSecretHash(passwords.encode(UUID.randomUUID().toString()));
        d.setPairingCodeHash(null); // mã chỉ dùng một lần
        d.setLifecycleStatus(DeviceLifecycleStatus.PROVISIONED);
        audit(ownerId, d, "PAIR_EDGE_AI", Map.of("deviceUid", d.getDeviceUid(), "unitId", unitId));
        return new Issued(d.getDeviceUid(), secret);
    }

    /** 96 bit ngẫu nhiên, dạng AI-XXXXXX-XXXXXX-XXXXXX-XXXXXX cho dễ đọc/nhập. */
    private static String newCode() {
        byte[] bytes = new byte[12]; new SecureRandom().nextBytes(bytes);
        String raw = HexFormat.of().withUpperCase().formatHex(bytes);
        return "AI-" + raw.substring(0, 6) + "-" + raw.substring(6, 12) + "-" + raw.substring(12, 18) + "-" + raw.substring(18);
    }

    /** Chấp nhận chữ thường và khoảng trắng khi người dùng gõ lại mã. */
    static String normalize(String code) {
        return code == null ? "" : code.replaceAll("\\s+", "").toUpperCase(Locale.ROOT);
    }

    private void audit(Long actorId, Device d, String action, Map<String, Object> details) {
        AuditLog log = new AuditLog(); log.setActor(accounts.getReferenceById(actorId));
        log.setAction(action); log.setEntityType("DEVICE"); log.setEntityId(d.getDeviceId()); log.setDetails(details);
        audits.save(log);
    }
}
