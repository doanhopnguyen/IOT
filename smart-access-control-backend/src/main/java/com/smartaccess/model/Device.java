package com.smartaccess.model;

import com.smartaccess.model.enumtype.DeviceLifecycleStatus;
import com.smartaccess.model.enumtype.DeviceType;
import jakarta.persistence.*;
import java.time.LocalDateTime;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "devices")
@Getter
@Setter
@NoArgsConstructor
public class Device {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "device_id")
    private Long deviceId;

    @ManyToOne(fetch = FetchType.LAZY, optional = true)
    @JoinColumn(name = "unit_id", nullable = true)
    private AccessUnit accessUnit;

    @Column(name = "device_uid", nullable = false, unique = true, length = 64)
    private String deviceUid;

    @Column(name = "device_name", nullable = false, length = 100)
    private String deviceName;

    @Enumerated(EnumType.STRING)
    @Column(name = "device_type", nullable = false, length = 30)
    private DeviceType deviceType;

    @Column(name = "bootstrap_secret_hash", nullable = true, length = 255)
    private String bootstrapSecretHash;

    @Column(name = "device_secret_hash", nullable = true, length = 255)
    private String deviceSecretHash;

    @Column(name = "local_admin_pin_enabled", nullable = false)
    private boolean localAdminPinEnabled = false;

    @Column(name = "local_admin_pin_hash", nullable = true, length = 255)
    private String localAdminPinHash;

    @Column(name = "hardware_version", nullable = true, length = 50)
    private String hardwareVersion;

    @Column(name = "firmware_version", nullable = true, length = 50)
    private String firmwareVersion;

    @Enumerated(EnumType.STRING)
    @Column(name = "lifecycle_status", nullable = false, length = 30)
    private DeviceLifecycleStatus lifecycleStatus = DeviceLifecycleStatus.REGISTERED;

    @Column(name = "last_seen_at", nullable = true, columnDefinition = "datetime(3)")
    private LocalDateTime lastSeenAt;

    @Column(name = "created_at", nullable = false, columnDefinition = "datetime(3)")
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false, columnDefinition = "datetime(3)")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        LocalDateTime now = LocalDateTime.now().truncatedTo(java.time.temporal.ChronoUnit.MILLIS);
        if (createdAt == null) { createdAt = now; }
        if (updatedAt == null) { updatedAt = now; }
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now().truncatedTo(java.time.temporal.ChronoUnit.MILLIS);
    }
}
