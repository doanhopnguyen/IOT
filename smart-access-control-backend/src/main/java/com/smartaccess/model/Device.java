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

    /** SHA-256 của mã ghép bộ camera AI (dùng một lần); null khi đã ghép hoặc không phải bộ camera chờ ghép. */
    @Column(name = "pairing_code_hash", nullable = true, length = 64, unique = true)
    private String pairingCodeHash;

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

    @Column(name = "edge_software_version", length = 100)
    private String edgeSoftwareVersion;

    @Column(name = "edge_model_version", length = 100)
    private String edgeModelVersion;

    @Column(name = "edge_camera_status", length = 30)
    private String edgeCameraStatus;

    @Column(name = "edge_recognition_status", length = 30)
    private String edgeRecognitionStatus;

    @Column(name = "edge_error_code", length = 100)
    private String edgeErrorCode;

    @Column(name = "edge_last_frame_at", columnDefinition = "datetime(3)")
    private LocalDateTime edgeLastFrameAt;

    @Column(name = "edge_reported_at", columnDefinition = "datetime(3)")
    private LocalDateTime edgeReportedAt;

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
