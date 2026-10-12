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
    private final CommandRepository commands;
    private final AccessUnitRepository units;
    private final AccountRepository accounts;
    private final CredentialRepository credentials;
    private final AccessLogRepository accessLogs;
    private final AuditLogRepository audits;

    public CommandAckService(CommandRepository commands, AccessUnitRepository units,
            AccountRepository accounts, CredentialRepository credentials,
            AccessLogRepository accessLogs, AuditLogRepository audits) {
        this.commands = commands;
        this.units = units;
        this.accounts = accounts;
        this.credentials = credentials;
        this.accessLogs = accessLogs;
        this.audits = audits;
    }

    @Transactional
    public void handleAck(String deviceUid, String commandUuid, boolean success, String message) {
        Command command = commands.findByCommandUuid(commandUuid).orElse(null);
        if (command == null
                || !command.getDevice().getDeviceUid().equals(deviceUid)
                || command.getStatus() == CommandStatus.ACKNOWLEDGED
                || command.getStatus() == CommandStatus.FAILED) {
            return;
        }
        command.setAcknowledgedAt(LocalDateTime.now());
        command.setResultMessage(message);
        if (!success) {
            command.setStatus(CommandStatus.FAILED);
            return;
        }
        String entityType = "CREDENTIAL";
        Long entityId = null;
        switch (command.getCommandType()) {
            case PinService.PIN_SET -> {
                entityType = "ACCESS_UNIT";
                entityId = applyPin(command);
            }
            case RemoteUnlockService.DOOR_UNLOCK -> {
                entityType = "ACCESS_UNIT";
                entityId = applyUnlock(command);
            }
            case FingerprintService.FP_ENROLL -> entityId = applyEnroll(command);
            case FingerprintService.FP_DELETE -> entityId = applyDelete(command);
            default -> { }
        }
        command.setStatus(CommandStatus.ACKNOWLEDGED);
        audit(command, entityType, entityId);
    }

    private Long applyPin(Command command) {
        Long unitId = ((Number) command.getPayload().get("unitId")).longValue();
        AccessUnit unit = units.findById(unitId).orElseThrow();
        unit.setAccessPinHash((String) command.getPayload().get("pinHash"));
        unit.setPinEnabled(true);
        command.setPayload(Map.of("unitId", unitId)); // bỏ hash khỏi lịch sử lệnh
        return unitId;
    }

    private Long applyEnroll(Command command) {
        Map<String, Object> p = command.getPayload();
        Credential credential = new Credential();
        credential.setAccount(accounts.getReferenceById(((Number) p.get("accountId")).longValue()));
        credential.setCredentialType(CredentialType.FINGERPRINT);
        credential.setDevice(command.getDevice());
        credential.setLocalTemplateId(((Number) p.get("templateId")).shortValue());
        return credentials.save(credential).getCredentialId();
    }

    private Long applyDelete(Command command) {
        Long credentialId = ((Number) command.getPayload().get("credentialId")).longValue();
        Credential credential = credentials.findById(credentialId).orElseThrow();
        credential.setStatus(CredentialStatus.REVOKED);
        credential.setRevokedAt(LocalDateTime.now());
        return credentialId;
    }

    private Long applyUnlock(Command command) {
        Long unitId = ((Number) command.getPayload().get("unitId")).longValue();
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
