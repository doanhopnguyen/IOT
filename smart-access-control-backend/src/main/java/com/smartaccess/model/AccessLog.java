package com.smartaccess.model;

import com.smartaccess.model.enumtype.AccessMethod;
import com.smartaccess.model.enumtype.AccessResult;
import jakarta.persistence.*;
import java.time.LocalDateTime;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "access_logs")
@Getter
@Setter
@NoArgsConstructor
public class AccessLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "access_log_id")
    private Long accessLogId;

    @Column(name = "access_uuid", nullable = false, unique = true, columnDefinition = "char(36)")
    private String accessUuid;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "unit_id", nullable = false)
    private AccessUnit accessUnit;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "source_device_id", nullable = false)
    private Device sourceDevice;

    @ManyToOne(fetch = FetchType.LAZY, optional = true)
    @JoinColumn(name = "account_id", nullable = true)
    private Account account;

    @ManyToOne(fetch = FetchType.LAZY, optional = true)
    @JoinColumn(name = "credential_id", nullable = true)
    private Credential credential;

    @Enumerated(EnumType.STRING)
    @Column(name = "method", nullable = false, length = 30)
    private AccessMethod method;

    @Enumerated(EnumType.STRING)
    @Column(name = "result", nullable = false, length = 20)
    private AccessResult result;

    @Column(name = "reason_code", nullable = true, length = 50)
    private String reasonCode;

    @Column(name = "occurred_at", nullable = false, columnDefinition = "datetime(3)")
    private LocalDateTime occurredAt;

    @Column(name = "received_at", nullable = false, columnDefinition = "datetime(3)")
    private LocalDateTime receivedAt;

    @PrePersist
    protected void onCreate() {
        LocalDateTime now = LocalDateTime.now().truncatedTo(java.time.temporal.ChronoUnit.MILLIS);
        if (receivedAt == null) { receivedAt = now; }
    }
}
