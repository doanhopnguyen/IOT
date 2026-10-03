package com.smartaccess.model;

import com.smartaccess.model.enumtype.AlertStatus;
import com.smartaccess.model.enumtype.EventSeverity;
import jakarta.persistence.*;
import java.time.LocalDateTime;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "events")
@Getter
@Setter
@NoArgsConstructor
public class Event {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "event_id")
    private Long eventId;

    @Column(name = "event_uuid", nullable = false, unique = true, columnDefinition = "char(36)")
    private String eventUuid;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "device_id", nullable = false)
    private Device device;

    @Column(name = "event_type", nullable = false, length = 50)
    private String eventType;

    @Enumerated(EnumType.STRING)
    @Column(name = "severity", nullable = false, length = 20)
    private EventSeverity severity = EventSeverity.INFO;

    @Enumerated(EnumType.STRING)
    @Column(name = "alert_status", nullable = false, length = 20)
    private AlertStatus alertStatus = AlertStatus.NONE;

    @Column(name = "message", nullable = true, length = 255)
    private String message;

    @Column(name = "occurred_at", nullable = false, columnDefinition = "datetime(3)")
    private LocalDateTime occurredAt;

    @Column(name = "received_at", nullable = false, columnDefinition = "datetime(3)")
    private LocalDateTime receivedAt;

    @Column(name = "updated_at", nullable = false, columnDefinition = "datetime(3)")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        LocalDateTime now = LocalDateTime.now().truncatedTo(java.time.temporal.ChronoUnit.MILLIS);
        if (receivedAt == null) { receivedAt = now; }
        if (updatedAt == null) { updatedAt = now; }
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now().truncatedTo(java.time.temporal.ChronoUnit.MILLIS);
    }
}
