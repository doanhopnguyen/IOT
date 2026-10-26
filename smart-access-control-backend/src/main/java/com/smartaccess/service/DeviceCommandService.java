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
        Command command = new Command();
        command.setCommandUuid(uuid);
        command.setDevice(device);
        command.setRequestedBy(accounts.getReferenceById(requestedBy));
        command.setCommandType(type);
        command.setPayload(payload);
        commands.save(command);
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
