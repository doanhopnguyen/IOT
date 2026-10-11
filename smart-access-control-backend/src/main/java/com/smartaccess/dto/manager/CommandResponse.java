package com.smartaccess.dto.manager;

import com.smartaccess.model.Command;
import com.smartaccess.model.enumtype.CommandStatus;

public record CommandResponse(String commandUuid, CommandStatus status, String resultMessage) {
    public static CommandResponse from(Command command) {
        return new CommandResponse(command.getCommandUuid(), command.getStatus(), command.getResultMessage());
    }
}
