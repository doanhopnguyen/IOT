package com.smartaccess.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.Map;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "audit_logs")
@Getter
@Setter
@NoArgsConstructor
public class AuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "audit_log_id")
    private Long auditLogId;

    @ManyToOne(fetch = FetchType.LAZY, optional = true)
    @JoinColumn(name = "actor_id", nullable = true)
    private Account actor;

    @Column(name = "action", nullable = false, length = 100)
    private String action;

    @Column(name = "entity_type", nullable = false, length = 50)
    private String entityType;

    @Column(name = "entity_id", nullable = true)
    private Long entityId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "details", nullable = true, columnDefinition = "json")
    private Map<String, Object> details;

    @Column(name = "created_at", nullable = false, columnDefinition = "datetime(3)")
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        LocalDateTime now = LocalDateTime.now().truncatedTo(java.time.temporal.ChronoUnit.MILLIS);
        if (createdAt == null) { createdAt = now; }
    }
}
