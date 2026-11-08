package com.smartaccess.service;

import com.smartaccess.model.AccessLog;
import com.smartaccess.model.AccessUnit;
import com.smartaccess.model.AuditLog;
import com.smartaccess.model.Command;
import com.smartaccess.model.Credential;
import com.smartaccess.model.enumtype.AccessMethod;
import com.smartaccess.model.enumtype.AccessResult;
import com.smartaccess.model.enumtype.CommandStatus;
import com.smartaccess.model.enumtype.CredentialStatus;
import com.smartaccess.model.enumtype.CredentialType;
import com.smartaccess.repository.AccessLogRepository;
import com.smartaccess.repository.AccessUnitRepository;
import com.smartaccess.repository.AccountRepository;
import com.smartaccess.repository.AuditLogRepository;
import com.smartaccess.repository.CommandRepository;
import com.smartaccess.repository.CredentialRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.util.Map;

@Service
public class CommandAckService {
    /** Firmware chỉ đọc bảng ô 0..255 của cảm biến. */
    static final int MAX_TEMPLATE_ID = 255;
    private final CommandRepository commands;
    private final AccessUnitRepository units;
    private final AccountRepository accounts;
    private final CredentialRepository credentials;
    private final AccessLogRepository accessLogs;
    private final AuditLogRepository audits;
    private final com.smartaccess.repository.DeviceRepository devices;
    private final com.smartaccess.repository.EventRepository events;
    private final com.smartaccess.repository.DeviceInventoryRepository inventory;

    public CommandAckService(CommandRepository commands, AccessUnitRepository units,
            AccountRepository accounts, CredentialRepository credentials,
            AccessLogRepository accessLogs, AuditLogRepository audits, com.smartaccess.repository.DeviceRepository devices,
            com.smartaccess.repository.EventRepository events,com.smartaccess.repository.DeviceInventoryRepository inventory) {
        this.commands = commands;
        this.units = units;
        this.accounts = accounts;
        this.credentials = credentials;
        this.accessLogs = accessLogs;
        this.audits = audits;
        this.devices = devices;
        this.events=events;this.inventory=inventory;
    }

    @Transactional
    public void handleAck(String deviceUid, String commandUuid, boolean success, String message) {
        handleAck(deviceUid, commandUuid, success, message, null);
    }

    /**
     * reportedTemplateId: ô vân tay firmware thực sự đã lưu (firmware mới có thể chọn ô khác ô đề nghị
     * khi cảm biến còn mẫu cũ). Null với firmware cũ hoặc lệnh không phải FP_ENROLL.
     */
    @Transactional
    public void handleAck(String deviceUid, String commandUuid, boolean success, String message,
            Integer reportedTemplateId) {
        devices.findByDeviceUidForUpdate(deviceUid); // Serialize enrollment ACKs with member cleanup and slot allocation.
        Command command = commands.findForUpdate(commandUuid).orElse(null);
        if (command == null
                || !command.getDevice().getDeviceUid().equals(deviceUid)
                || command.getStatus() == CommandStatus.ACKNOWLEDGED
                || command.getStatus() == CommandStatus.FAILED) {
            return;
        }
        boolean face = command.getPayload() != null && "FACE".equals(command.getPayload().get("accessMethod"));
        if (face && (command.getStatus() == CommandStatus.TIMEOUT
                || command.getRequestedAt().isBefore(LocalDateTime.now().minusSeconds(15)))) return;
        command.setAcknowledgedAt(LocalDateTime.now());
        command.setResultMessage(message);
        if (!success) {
            command.setStatus(CommandStatus.FAILED);
            if (face) accessLogs.findByAccessUuid(commandUuid).ifPresent(log -> {
                log.setResult(AccessResult.ERROR); log.setReasonCode("DEVICE_FAILED");
            });
            return;
        }
        String entityType = "CREDENTIAL";
        Long entityId = null;
        switch (command.getCommandType()) {
            case PinAlertResponseService.SAFE,PinAlertResponseService.LOCKDOWN -> {
                entityId=applyPinAlertResponse(command,message);
                if(entityId==null){command.setStatus(CommandStatus.FAILED);command.setResultMessage("PIN_RESPONSE_NOT_CONFIRMED");return;}
                entityType="EVENT";
            }
            case PinService.PIN_SET, PinService.ADMIN_PIN_SET, OnboardingService.SETUP_CREDENTIALS -> {
                entityType = "ACCESS_UNIT";
                entityId = applyPin(command);
            }
            case RemoteUnlockService.DOOR_UNLOCK -> {
                entityType = "ACCESS_UNIT";
                entityId = applyUnlock(command);
            }
            case RemoteUnlockService.DOOR_LOCK -> {
                entityType="ACCESS_UNIT";
                entityId=((Number)command.getPayload().get("unitId")).longValue();
            }
            case FingerprintService.FP_ENROLL -> {
                entityId = applyEnroll(command, reportedTemplateId);
                if (entityId == null) {
                    command.setStatus(CommandStatus.FAILED);
                    command.setResultMessage("SLOT_CONFLICT");
                    return;
                }
            }
            case FingerprintService.FP_DELETE -> entityId = applyDelete(command);
            case OnboardingService.SERVO_SET, OnboardingService.SERVO_PREVIEW, OnboardingService.SERVO_PREVIEW_STOP -> { entityType="DEVICE"; entityId=command.getDevice().getDeviceId(); }
            case DeploymentService.SYNC_ACTIVATION -> { entityType="DEVICE"; entityId=command.getDevice().getDeviceId(); }
            case FirmwareUpdateService.COMMAND -> {
                Object version=command.getPayload()==null?null:command.getPayload().get("version");
                if(version==null || !("FIRMWARE_UPDATED:"+version).equals(message)) {
                    command.setStatus(CommandStatus.FAILED);command.setResultMessage("OTA_BOOT_VERSION_NOT_CONFIRMED");return;
                }
                entityType="DEVICE";entityId=command.getDevice().getDeviceId();
            }
            default -> { }
        }
        command.setStatus(CommandStatus.ACKNOWLEDGED);
        audit(command, entityType, entityId);
    }
    private Long applyPinAlertResponse(Command command,String message){
        if(!(command.getCommandType()+"_APPLIED").equals(message) || command.getPayload()==null ||
                !(command.getPayload().get("pinAlertId") instanceof Number id) ||
                !(command.getPayload().get("generation") instanceof Number generation))return null;
        long currentGeneration=inventory.findById(command.getDevice().getDeviceId()).map(com.smartaccess.model.DeviceInventory::getGeneration).orElse(0L);
        if(generation.longValue()!=currentGeneration)return null;
        var alert=events.findById(id.longValue()).orElse(null);
        if(alert==null || !AlertRuleService.REPEATED_WRONG_PIN.equals(alert.getEventType()) ||
                !alert.getDevice().getDeviceId().equals(command.getDevice().getDeviceId()) ||
                alert.getDevice().getAccessUnit()==null || alert.getDevice().getAccessUnit().getManager()==null ||
                command.getRequestedBy()==null || !command.getRequestedBy().getAccountId().equals(alert.getDevice().getAccessUnit().getManager().getAccountId()))return null;
        alert.setAlertStatus(com.smartaccess.model.enumtype.AlertStatus.RESOLVED);
        return alert.getEventId();
    }

    private Long applyPin(Command command) {
        Long unitId = ((Number) command.getPayload().get("unitId")).longValue();
        AccessUnit unit = units.findById(unitId).orElseThrow();
        if (command.getPayload().get("pinHash") instanceof String pinHash) {
            unit.setAccessPinHash(pinHash);
            unit.setPinEnabled(true);
        }
        if (command.getPayload().get("adminPinHash") instanceof String hash) {
            command.getDevice().setLocalAdminPinHash(hash); command.getDevice().setLocalAdminPinEnabled(true);
        }
        command.setPayload(Map.of("unitId", unitId)); // bỏ hash khỏi lịch sử lệnh
        return unitId;
    }

    /** Trả null nếu ô firmware báo về đang thuộc một vân tay ACTIVE khác của thiết bị. */
    private Long applyEnroll(Command command, Integer reportedTemplateId) {
        Map<String, Object> p = command.getPayload();
        int slot = ((Number) p.get("templateId")).intValue();
        if (reportedTemplateId != null && reportedTemplateId >= 1 && reportedTemplateId <= MAX_TEMPLATE_ID) {
            slot = reportedTemplateId;
        }
        final int chosen = slot;
        boolean taken = credentials.findByDevice_DeviceIdAndCredentialTypeAndStatus(
                        command.getDevice().getDeviceId(), CredentialType.FINGERPRINT, CredentialStatus.ACTIVE)
                .stream().anyMatch(c -> c.getLocalTemplateId() != null && c.getLocalTemplateId() == chosen);
        if (taken) return null;
        Credential credential = new Credential();
        credential.setAccount(accounts.getReferenceById(((Number) p.get("accountId")).longValue()));
        credential.setCredentialType(CredentialType.FINGERPRINT);
        credential.setDevice(command.getDevice());
        credential.setLocalTemplateId((short) chosen);
        if (chosen != ((Number) p.get("templateId")).intValue()) {
            Map<String, Object> updated = new java.util.HashMap<>(p);
            updated.put("templateId", chosen);
            command.setPayload(updated);
        }
        return credentials.save(credential).getCredentialId();
    }

    private Long applyDelete(Command command) {
        Long credentialId = ((Number) command.getPayload().get("credentialId")).longValue();
        credentials.findById(credentialId).ifPresent(credential -> {
            credential.setStatus(CredentialStatus.REVOKED);
            credential.setRevokedAt(LocalDateTime.now());
        }); // A member cleanup may already have deleted this credential before a late FP_DELETE ACK.
        return credentialId;
    }

    private Long applyUnlock(Command command) {
        Long unitId = ((Number) command.getPayload().get("unitId")).longValue();
        if ("FACE".equals(command.getPayload().get("accessMethod"))) {
            AccessLog log = accessLogs.findByAccessUuid(command.getCommandUuid()).orElseThrow();
            log.setResult(AccessResult.GRANTED); log.setReasonCode(null);
            return unitId;
        }
        AccessLog log = new AccessLog();
        log.setAccessUuid(command.getCommandUuid());
        log.setAccessUnit(units.getReferenceById(unitId));
        log.setSourceDevice(command.getDevice());
        log.setAccount(command.getRequestedBy());
        log.setMethod(AccessMethod.REMOTE_UNLOCK);
        log.setResult(AccessResult.GRANTED);
        log.setOccurredAt(command.getAcknowledgedAt());
        accessLogs.save(log);
        return unitId;
    }

    private void audit(Command command, String entityType, Long entityId) {
        AuditLog audit = new AuditLog();
        audit.setActor(command.getRequestedBy());
        audit.setAction(command.getCommandType());
        audit.setEntityType(entityType);
        audit.setEntityId(entityId);
        // Schema không có cột tên gợi nhớ cho credential, nên tên vân tay được giữ ở đây
        Object label = command.getPayload().get("label");
        audit.setDetails(label == null
                ? Map.of("commandUuid", command.getCommandUuid())
                : Map.of("commandUuid", command.getCommandUuid(), "label", label));
        audits.save(audit);
    }
}
