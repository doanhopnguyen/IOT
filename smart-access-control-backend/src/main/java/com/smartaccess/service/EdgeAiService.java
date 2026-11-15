package com.smartaccess.service;

import com.smartaccess.model.Device;
import com.smartaccess.model.enumtype.*;
import com.smartaccess.repository.DeviceRepository;
import jakarta.validation.constraints.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.time.*;
import static org.springframework.http.HttpStatus.UNAUTHORIZED;

@Service
public class EdgeAiService {
    public record Health(
            @NotBlank @Size(max = 100) String softwareVersion,
            @NotBlank @Size(max = 100) String modelVersion,
            @NotNull @Pattern(regexp = "READY|NO_SIGNAL|STARTING") String cameraStatus,
            @NotNull @Pattern(regexp = "READY|WAITING|ERROR") String recognitionStatus,
            @Pattern(regexp = "[A-Z0-9_]{1,100}") String errorCode,
            Instant lastFrameAt) {}

    private final DeviceAuthenticationService authentication;
    private final DeviceRepository devices;

    public EdgeAiService(DeviceAuthenticationService authentication, DeviceRepository devices) {
        this.authentication = authentication; this.devices = devices;
    }

    /** Suspended nodes may report health and read their disabled state, never fetch templates or send events. */
    public Device runtimeDevice(String uid, String secret) {
        Device device = authentication.authenticateRuntimeStatus(uid, secret);
        if (device.getDeviceType() != DeviceType.FACE_CAMERA_NODE || device.getAccessUnit() == null)
            throw new ResponseStatusException(UNAUTHORIZED, "Edge AI không hợp lệ");
        return device;
    }

    @Transactional
    public void heartbeat(String uid, String secret, Health health) {
        // Serialize with admin lifecycle changes, then authenticate the current state inside the lock.
        devices.findByDeviceUidForUpdate(uid).orElseThrow(() -> new ResponseStatusException(UNAUTHORIZED));
        Device device = runtimeDevice(uid, secret);
        if (device.getLifecycleStatus() != DeviceLifecycleStatus.SUSPENDED)
            device.setLifecycleStatus(DeviceLifecycleStatus.ACTIVE);
        LocalDateTime now = LocalDateTime.now();
        device.setLastSeenAt(now);
        if (health != null) {
            device.setEdgeSoftwareVersion(health.softwareVersion());
            device.setEdgeModelVersion(health.modelVersion());
            device.setEdgeCameraStatus(health.cameraStatus());
            device.setEdgeRecognitionStatus(health.recognitionStatus());
            device.setEdgeErrorCode(health.errorCode());
            LocalDateTime frame = health.lastFrameAt() == null ? null
                    : LocalDateTime.ofInstant(health.lastFrameAt(), ZoneId.systemDefault());
            device.setEdgeLastFrameAt(frame != null && frame.isAfter(now) ? now : frame);
            device.setEdgeReportedAt(now);
        }
        devices.save(device);
    }
}
