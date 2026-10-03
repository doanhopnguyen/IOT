package com.smartaccess.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "telemetry")
@Getter
@Setter
@NoArgsConstructor
public class Telemetry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "telemetry_id")
    private Long telemetryId;

    @Column(name = "message_uuid", nullable = false, unique = true, columnDefinition = "char(36)")
    private String messageUuid;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "device_id", nullable = false)
    private Device device;

    @Column(name = "metric_name", nullable = false, length = 50)
    private String metricName;

    @Column(name = "metric_value", nullable = false, length = 100)
    private String metricValue;

    @Column(name = "measurement_unit", nullable = true, length = 20)
    private String measurementUnit;

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
