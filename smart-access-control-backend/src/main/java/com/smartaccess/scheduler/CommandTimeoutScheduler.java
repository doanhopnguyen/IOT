package com.smartaccess.scheduler;

import com.smartaccess.model.Command;
import com.smartaccess.model.enumtype.CommandStatus;
import com.smartaccess.repository.CommandRepository;
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

    public CommandTimeoutScheduler(CommandRepository commands) { this.commands = commands; }

    @Scheduled(fixedDelay = 5000)
    @Transactional
    public void expireCommands() {
        LocalDateTime now = LocalDateTime.now();
        commands.findByStatusInAndRequestedAtBefore(
                        List.of(CommandStatus.PENDING, CommandStatus.SENT),
                        now.minusSeconds(UNLOCK_TIMEOUT_SEC))
                .stream()
                .filter(command -> command.getRequestedAt().isBefore(now.minusSeconds(timeoutOf(command))))
                .forEach(command -> {
                    command.setStatus(CommandStatus.TIMEOUT);
                    command.setResultMessage("Thiết bị không phản hồi");
                });
    }

    private long timeoutOf(Command command) {
        return RemoteUnlockService.DOOR_UNLOCK.equals(command.getCommandType())
                ? UNLOCK_TIMEOUT_SEC : COMMAND_TIMEOUT_SEC;
    }
}
