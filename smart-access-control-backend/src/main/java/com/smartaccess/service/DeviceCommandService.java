package com.smartaccess.service;

import com.smartaccess.dto.manager.CommandResponse;
import com.smartaccess.exception.BusinessException;
import com.smartaccess.model.Command;
import com.smartaccess.model.Device;
import com.smartaccess.model.enumtype.CommandStatus;
import com.smartaccess.repository.AccountRepository;
import com.smartaccess.repository.CommandRepository;
import com.smartaccess.repository.AccessLogRepository;
import com.smartaccess.model.enumtype.AccessResult;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import java.util.Map;
import java.util.UUID;

@Service
public class DeviceCommandService {
    private final CommandRepository commands;
    private final AccountRepository accounts;
    private final ApplicationEventPublisher events;
    private final DeviceGateway gateway;
    private final AccessLogRepository accessLogs;
    @org.springframework.beans.factory.annotation.Autowired(required=false)
    private com.smartaccess.repository.DeviceRepository devices;
    @org.springframework.beans.factory.annotation.Autowired(required=false)
    private com.smartaccess.repository.DeviceInventoryRepository inventory;

    public DeviceCommandService(CommandRepository commands, AccountRepository accounts,
            ApplicationEventPublisher events, DeviceGateway gateway, AccessLogRepository accessLogs) {
        this.commands = commands;
        this.accounts = accounts;
        this.events = events;
        this.gateway = gateway;
        this.accessLogs = accessLogs;
    }

    // payload: lưu DB để dùng lại khi có ACK. wireData: gửi xuống thiết bị, không lưu DB.
    @Transactional(propagation = Propagation.MANDATORY)
    public Command dispatch(Device device, Long requestedBy, String type,
            Map<String, Object> payload, Map<String, Object> wireData) {
        return dispatchWithUuid(device, requestedBy, type, payload, wireData, UUID.randomUUID().toString());
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public Command dispatchWithUuid(Device device, Long requestedBy, String type,
            Map<String, Object> payload, Map<String, Object> wireData, String uuid) {
        if(devices!=null && !java.util.Set.of("DEVICE_RESET","DEVICE_DECOMMISSION","MEMBER_REMOVE",EnrollmentService.CANCEL,DeploymentService.SYNC_ACTIVATION).contains(type)) {
            var current=devices.findByDeviceUidForUpdate(device.getDeviceUid()).orElse(device);
            if(current.getLifecycleStatus()==com.smartaccess.model.enumtype.DeviceLifecycleStatus.SUSPENDED ||
                    current.getLifecycleStatus()==com.smartaccess.model.enumtype.DeviceLifecycleStatus.DECOMMISSIONED)
                throw new BusinessException(HttpStatus.CONFLICT,"Thiết bị chỉ cho phép xem thông tin");
        }
        if(inventory!=null && ("FP_ENROLL".equals(type) || "RFID_SCAN".equals(type))) {
            var generation=inventory.findById(device.getDeviceId()).map(com.smartaccess.model.DeviceInventory::getGeneration).orElse(0L);
            payload=new java.util.LinkedHashMap<>(payload); payload.put("enrollmentGeneration",generation);
        }
        Command command = new Command();
        command.setCommandUuid(uuid);
        command.setDevice(device);
        command.setRequestedBy(accounts.getReferenceById(requestedBy));
        command.setCommandType(type);
        command.setPayload(payload);
        commands.save(command);
        if ("FP_ENROLL".equals(type) || "RFID_SCAN".equals(type)) {
            wireData = new java.util.LinkedHashMap<>(wireData);
            wireData.put("enrollmentSeq", command.getCommandId());
            // Bound scanning by the original request, even if transaction commit/MQTT delivery is delayed.
            // The 10-second margin covers device clock skew before the 60-second command timeout.
            wireData.put("enrollmentExpiresAt", java.time.Instant.now().getEpochSecond()+50);
        }
        if (type.startsWith("SERVO_")) {
            wireData = new java.util.LinkedHashMap<>(wireData);
            wireData.put("servoSeq", command.getCommandId());
        }
        if (type.startsWith("PIN_ALERT_")) {
            wireData = new java.util.LinkedHashMap<>(wireData);
            wireData.put("pinResponseSeq", command.getCommandId());
        }
        if (DeploymentService.SYNC_ACTIVATION.equals(type)) {
            wireData = new java.util.LinkedHashMap<>(wireData);
            wireData.put("activationSequence", command.getCommandId());
        }
        events.publishEvent(new CommandCreatedEvent(
                command.getCommandUuid(), device.getDeviceUid(), type, wireData));
        return command;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void sendAfterCommit(CommandCreatedEvent event) {
        Command command = commands.findForUpdate(event.commandUuid()).orElseThrow();
        if (command.getStatus() != CommandStatus.PENDING) return;
        try {
            command.setStatus(CommandStatus.SENT);
            commands.flush(); // An immediate ACK waits on this transaction's row lock.
            gateway.send(event.deviceUid(), event.commandUuid(), event.commandType(), event.wireData());
        } catch (RuntimeException exception) {
            command.setStatus(CommandStatus.FAILED);
            command.setResultMessage("Không gửi được lệnh tới thiết bị");
            if (command.getPayload() != null && "FACE".equals(command.getPayload().get("accessMethod"))) {
                accessLogs.findByAccessUuid(command.getCommandUuid()).ifPresent(log -> {
                    log.setResult(AccessResult.ERROR); log.setReasonCode("SEND_FAILED");
                });
            }
        }
    }

    @Transactional(readOnly = true)
    public CommandResponse getOwnCommand(Long managerId, String commandUuid) {
        return commands.findByCommandUuid(commandUuid)
                .filter(c -> c.getRequestedBy() != null
                        && c.getRequestedBy().getAccountId().equals(managerId))
                .map(CommandResponse::from)
                .orElseThrow(() -> new BusinessException(HttpStatus.NOT_FOUND, "Không tìm thấy lệnh"));
    }
}
