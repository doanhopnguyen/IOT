package com.smartaccess.scheduler;

import com.smartaccess.model.Command;
import com.smartaccess.model.enumtype.CommandStatus;
import com.smartaccess.repository.CommandRepository;
import com.smartaccess.repository.AccessLogRepository;
import com.smartaccess.model.enumtype.AccessResult;
import com.smartaccess.service.DeploymentService;
import com.smartaccess.service.RemoteUnlockService;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.util.List;

@Component
public class CommandTimeoutScheduler {
    private static final long COMMAND_TIMEOUT_SEC = 60;
    private static final long UNLOCK_TIMEOUT_SEC = 15;

    private final CommandRepository commands;
    private final AccessLogRepository logs;
    private final DeploymentService deployment;

    public CommandTimeoutScheduler(CommandRepository commands, AccessLogRepository logs, DeploymentService deployment) {
        this.commands = commands; this.logs = logs; this.deployment = deployment;
    }

    @Scheduled(fixedDelay = 5000)
    @Transactional
    public void expireCommands() {
        LocalDateTime now = LocalDateTime.now();
        commands.findExpirableUuids(
                        List.of(CommandStatus.PENDING, CommandStatus.SENT),
                        now.minusSeconds(UNLOCK_TIMEOUT_SEC))
                .forEach(uuid -> {
                    Command locked = commands.findForUpdate(uuid).orElseThrow();
                    if (locked.getStatus() != CommandStatus.PENDING && locked.getStatus() != CommandStatus.SENT) return;
                    if (!locked.getRequestedAt().isBefore(now.minusSeconds(timeoutOf(locked)))) return;
                    locked.setStatus(CommandStatus.TIMEOUT);
                    locked.setResultMessage("Thiết bị không phản hồi");
                    if (locked.getPayload() != null && "FACE".equals(locked.getPayload().get("accessMethod"))) {
                        logs.findByAccessUuid(locked.getCommandUuid()).ifPresent(log -> {
                            log.setResult(AccessResult.ERROR); log.setReasonCode("ACK_TIMEOUT");
                        });
                    }
                    if (DeploymentService.RESET_COMMAND.equals(locked.getCommandType())) {
                        deployment.expireReset(locked.getDevice().getDeviceId(), locked.getCommandUuid());
                    }
                });
    }

    private long timeoutOf(Command command) {
        if(com.smartaccess.service.FirmwareUpdateService.COMMAND.equals(command.getCommandType()))return 300;
        return RemoteUnlockService.DOOR_UNLOCK.equals(command.getCommandType())
                ? UNLOCK_TIMEOUT_SEC : COMMAND_TIMEOUT_SEC;
    }
}
