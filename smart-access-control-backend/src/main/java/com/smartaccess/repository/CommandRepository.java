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

    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select c from Command c where c.commandUuid = :uuid")
    Optional<Command> findForUpdate(@org.springframework.data.repository.query.Param("uuid") String uuid);

    boolean existsByDevice_DeviceIdAndCommandTypeAndStatusIn(
            Long deviceId, String commandType, Collection<CommandStatus> statuses);

    List<Command> findByStatusInAndRequestedAtBefore(
            Collection<CommandStatus> statuses, LocalDateTime before);

    @org.springframework.data.jpa.repository.Query("select c.commandUuid from Command c where c.status in :statuses and c.requestedAt < :before")
    List<String> findExpirableUuids(@org.springframework.data.repository.query.Param("statuses") Collection<CommandStatus> statuses,
            @org.springframework.data.repository.query.Param("before") LocalDateTime before);
}
