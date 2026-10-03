package com.smartaccess.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "access_units")
@Getter
@Setter
@NoArgsConstructor
public class AccessUnit {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "unit_id")
    private Long unitId;

    @ManyToOne(fetch = FetchType.LAZY, optional = true)
    @JoinColumn(name = "manager_id", nullable = true)
    private Account manager;

    @Column(name = "unit_name", nullable = false, length = 100)
    private String unitName;

    @Column(name = "face_enabled", nullable = false)
    private boolean faceEnabled = true;

    @Column(name = "fingerprint_enabled", nullable = false)
    private boolean fingerprintEnabled = true;

    @Column(name = "rfid_enabled", nullable = false)
    private boolean rfidEnabled = true;

    @Column(name = "pin_enabled", nullable = false)
    private boolean pinEnabled = false;

    @Column(name = "remote_unlock_enabled", nullable = false)
    private boolean remoteUnlockEnabled = true;

    @Column(name = "access_pin_hash", nullable = true, length = 255)
    private String accessPinHash;

    @Column(name = "unlock_duration_sec", nullable = false)
    private Short unlockDurationSec = (short) 5;

    @Column(name = "door_open_timeout_sec", nullable = false)
    private Short doorOpenTimeoutSec = (short) 60;

    @Column(name = "created_at", nullable = false, columnDefinition = "datetime(3)")
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false, columnDefinition = "datetime(3)")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        LocalDateTime now = LocalDateTime.now().truncatedTo(java.time.temporal.ChronoUnit.MILLIS);
        if (createdAt == null) {
            createdAt = now;
        }
        if (updatedAt == null) {
            updatedAt = now;
        }
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now().truncatedTo(java.time.temporal.ChronoUnit.MILLIS);
    }
}
