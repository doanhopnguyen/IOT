package com.smartaccess.model;

import com.smartaccess.model.enumtype.CommandStatus;
import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.Map;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "commands")
@Getter
@Setter
@NoArgsConstructor
public class Command {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "command_id")
    private Long commandId;

    @Column(name = "command_uuid", nullable = false, unique = true, columnDefinition = "char(36)")
    private String commandUuid;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "device_id", nullable = false)
    private Device device;

    @ManyToOne(fetch = FetchType.LAZY, optional = true)
    @JoinColumn(name = "requested_by", nullable = true)
    private Account requestedBy;

    @Column(name = "command_type", nullable = false, length = 50)
    private String commandType;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "payload", nullable = true, columnDefinition = "json")
    private Map<String, Object> payload;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private CommandStatus status = CommandStatus.PENDING;

    @Column(name = "requested_at", nullable = false, columnDefinition = "datetime(3)")
    private LocalDateTime requestedAt;

    @Column(name = "acknowledged_at", nullable = true, columnDefinition = "datetime(3)")
    private LocalDateTime acknowledgedAt;

    @Column(name = "result_message", nullable = true, length = 255)
    private String resultMessage;

    @PrePersist
    protected void onCreate() {
        LocalDateTime now = LocalDateTime.now().truncatedTo(java.time.temporal.ChronoUnit.MILLIS);
        if (requestedAt == null) {
            requestedAt = now;
        }
    }
}
