package com.smartaccess.repository;

import com.smartaccess.model.enumtype.CommandStatus;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import com.smartaccess.model.Command;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CommandRepository extends JpaRepository<Command, Long> {

    Optional<Command> findByCommandUuid(String commandUuid);

    boolean existsByDevice_DeviceIdAndCommandTypeAndStatusIn(
            Long deviceId, String commandType, Collection<CommandStatus> statuses);

    List<Command> findByStatusInAndRequestedAtBefore(
            Collection<CommandStatus> statuses, LocalDateTime before);
}
