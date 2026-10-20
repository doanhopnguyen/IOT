package com.smartaccess.service;

import com.smartaccess.dto.manager.RfidCredentialResponse;
import com.smartaccess.exception.BusinessException;
import com.smartaccess.model.Credential;
import com.smartaccess.model.enumtype.CredentialStatus;
import com.smartaccess.model.enumtype.CredentialType;
import com.smartaccess.model.enumtype.DeviceType;
import com.smartaccess.repository.AccountRepository;
import com.smartaccess.repository.CredentialRepository;
import com.smartaccess.repository.DeviceRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.util.Locale;

/** Gán thẻ RFID có sẵn cho thành viên; thẻ đã được cửa chấp nhận nên không cần gửi lệnh xuống thiết bị. */
@Service
public class RfidService {
    private final ManagerAccessGuard guard;
    private final AccountRepository accounts;
    private final DeviceRepository devices;
    private final CredentialRepository credentials;

    public RfidService(ManagerAccessGuard guard, AccountRepository accounts, DeviceRepository devices,
            CredentialRepository credentials) {
        this.guard = guard;
        this.accounts = accounts;
        this.devices = devices;
        this.credentials = credentials;
    }

    @Transactional
    public RfidCredentialResponse assign(Long managerId, Long unitId, Long accountId, String rfidUid) {
        String uid = rfidUid == null ? "" : rfidUid.trim().toUpperCase(Locale.ROOT);
        if (!uid.matches("[0-9A-Z:\\-]{4,64}")) {
            throw new BusinessException(HttpStatus.BAD_REQUEST, "Mã thẻ gồm 4–64 ký tự chữ, số, ':' hoặc '-'");
        }
        guard.requireManagedUnit(managerId, unitId);
        guard.requireUserOfUnit(accountId, unitId);
        if (credentials.existsByRfidUidAndStatus(uid, CredentialStatus.ACTIVE)) {
            throw new BusinessException(HttpStatus.CONFLICT, "Thẻ này đã được gán, hãy thu hồi trước khi gán lại");
        }
        Credential credential = new Credential();
        credential.setAccount(accounts.getReferenceById(accountId));
        credential.setCredentialType(CredentialType.RFID);
        credential.setRfidUid(uid);
        // Gắn với bộ điều khiển của cửa (nếu có) để biết thẻ thuộc cửa nào
        devices.findFirstByAccessUnit_UnitIdAndDeviceType(unitId, DeviceType.DOOR_CONTROLLER)
                .ifPresent(credential::setDevice);
        credentials.save(credential);
        return new RfidCredentialResponse(credential.getCredentialId(), uid);
    }

    @Transactional
    public void revoke(Long managerId, Long unitId, Long accountId, Long credentialId) {
        guard.requireManagedUnit(managerId, unitId);
        Credential credential = credentials.findById(credentialId)
                .filter(c -> c.getCredentialType() == CredentialType.RFID)
                .filter(c -> c.getStatus() == CredentialStatus.ACTIVE)
                .filter(c -> c.getAccount().getAccountId().equals(accountId))
                .orElseThrow(() -> new BusinessException(HttpStatus.NOT_FOUND, "Thẻ RFID không tồn tại"));
        credential.setStatus(CredentialStatus.REVOKED);
        credential.setRevokedAt(LocalDateTime.now());
    }
}
