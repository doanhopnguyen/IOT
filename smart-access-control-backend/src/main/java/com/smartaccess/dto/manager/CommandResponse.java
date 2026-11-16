package com.smartaccess.dto.manager;

import com.smartaccess.model.Command;
import com.smartaccess.model.enumtype.CommandStatus;

public record CommandResponse(String commandUuid, CommandStatus status, String resultMessage, java.time.LocalDateTime acknowledgedAt) {
    public CommandResponse(String commandUuid, CommandStatus status, String resultMessage) {
        this(commandUuid,status,resultMessage,null);
    }
    public static CommandResponse from(Command command) {
        return new CommandResponse(command.getCommandUuid(), command.getStatus(), command.getResultMessage(),command.getAcknowledgedAt());
    }
}
