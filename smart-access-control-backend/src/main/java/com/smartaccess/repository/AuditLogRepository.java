package com.smartaccess.repository;

import com.smartaccess.model.AuditLog;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface AuditLogRepository extends JpaRepository<AuditLog, Long> {
    boolean existsByActionAndEntityTypeAndEntityId(String action, String entityType, Long entityId);

    Optional<AuditLog> findFirstByActionAndEntityTypeAndEntityIdOrderByAuditLogIdDesc(
            String action, String entityType, Long entityId);

    List<AuditLog> findByActionAndEntityTypeAndEntityIdIn(String action, String entityType, Collection<Long> entityIds);
}
