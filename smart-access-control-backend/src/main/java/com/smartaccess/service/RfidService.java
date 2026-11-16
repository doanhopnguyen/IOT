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

/** RFID changes are delivered in the next authenticated controller policy snapshot. */
@Service
public class RfidService {
    @org.springframework.beans.factory.annotation.Autowired
    private com.smartaccess.repository.CommandRepository commands;
    private final ManagerAccessGuard guard;
    private final AccountRepository accounts;
    private final DeviceRepository devices;
    private final CredentialRepository credentials;
    private final MemberRemovalService removals;

    public RfidService(ManagerAccessGuard guard, AccountRepository accounts, DeviceRepository devices,
            CredentialRepository credentials, MemberRemovalService removals) {
        this.guard = guard;
        this.accounts = accounts;
        this.devices = devices;
        this.credentials = credentials;
        this.removals = removals;
    }

    @Transactional
    public RfidCredentialResponse assignScanned(Long managerId, Long unitId, Long accountId, String rfidUid, String scanUuid) {
        guard.requireManagedUnit(managerId, unitId);
        var controller=guard.requireOnlineController(unitId);
        devices.findByDeviceUidForUpdate(controller.getDeviceUid()).orElseThrow();
        var scan=scanUuid==null?null:commands.findForUpdate(scanUuid).orElse(null);
        if(scan==null || !"RFID_SCAN".equals(scan.getCommandType()) ||
                scan.getRequestedBy()==null || !managerId.equals(scan.getRequestedBy().getAccountId()) ||
                !controller.getDeviceId().equals(scan.getDevice().getDeviceId()) ||
                scan.getStatus()!=com.smartaccess.model.enumtype.CommandStatus.ACKNOWLEDGED ||
                Boolean.TRUE.equals(scan.getPayload().get("cancelRequested")) ||
                !(scan.getPayload().get("accountId") instanceof Number id) || id.longValue()!=accountId ||
                !("RFID_UID:"+(rfidUid==null?"":rfidUid.toUpperCase(Locale.ROOT))).equals(scan.getResultMessage()))
            throw new BusinessException(HttpStatus.CONFLICT,"Phiên đọc thẻ chưa được xác nhận hoặc đã yêu cầu hủy");
        if(scan.getPayload().get("credentialId") instanceof Number credentialId) {
            var existing=credentials.findById(credentialId.longValue()).orElseThrow();
            return new RfidCredentialResponse(existing.getCredentialId(),existing.getRfidUid());
        }
        var result=assign(managerId,unitId,accountId,rfidUid);
        var payload=new java.util.HashMap<>(scan.getPayload());
        payload.put("credentialId",result.credentialId()); scan.setPayload(payload);
        return result;
    }

    @Transactional
    public RfidCredentialResponse assign(Long managerId, Long unitId, Long accountId, String rfidUid) {
        guard.requireWritableUnit(unitId);
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
        var controller=devices.findFirstByAccessUnit_UnitIdAndDeviceType(unitId,DeviceType.DOOR_CONTROLLER)
                .orElseThrow(()->new BusinessException(HttpStatus.CONFLICT,"Cửa chưa có bộ điều khiển"));
        controller=devices.findByDeviceUidForUpdate(controller.getDeviceUid()).orElseThrow();
        removals.requireNoCleanup(controller);
        credential.setDevice(controller);
        credentials.save(credential);
        return new RfidCredentialResponse(credential.getCredentialId(), uid);
    }

    @Transactional
    public void revoke(Long managerId, Long unitId, Long accountId, Long credentialId) {
        guard.requireWritableUnit(unitId);
        guard.requireManagedUnit(managerId, unitId);
        Credential credential = credentials.findById(credentialId)
                .filter(c -> c.getCredentialType() == CredentialType.RFID)
                .filter(c -> c.getStatus() == CredentialStatus.ACTIVE)
                .filter(c -> c.getAccount().getAccountId().equals(accountId))
                .filter(c -> c.getDevice() != null && c.getDevice().getAccessUnit() != null
                        && c.getDevice().getAccessUnit().getUnitId().equals(unitId))
                .orElseThrow(() -> new BusinessException(HttpStatus.NOT_FOUND, "Thẻ RFID không tồn tại"));
        credential.setStatus(CredentialStatus.REVOKED);
        credential.setRevokedAt(LocalDateTime.now());
    }
}
