package com.smartaccess.dto.manager;

import com.smartaccess.model.Device;
import com.smartaccess.model.enumtype.*;
import com.smartaccess.service.DeviceLifecyclePolicy;
import java.time.LocalDateTime;
import java.util.List;

/** Admin view deliberately excludes credentials and biometric templates. */
public record EdgeAiResponse(Long deviceId, String deviceUid, String name, DeviceType deviceType,
        Long unitId, String unitName, String owner, DeviceLifecycleStatus lifecycleStatus,
        LocalDateTime lastSeenAt, String softwareVersion, String modelVersion,
        String cameraStatus, String recognitionStatus, String errorCode,
        LocalDateTime lastFrameAt, LocalDateTime reportedAt, List<DeviceLifecycleStatus> allowedTransitions,
        boolean awaitingPairing) {
    public static EdgeAiResponse from(Device d) {
        var unit = d.getAccessUnit();
        return new EdgeAiResponse(d.getDeviceId(), d.getDeviceUid(), d.getDeviceName(), d.getDeviceType(),
                unit == null ? null : unit.getUnitId(), unit == null ? null : unit.getUnitName(),
                unit == null || unit.getManager() == null ? null : unit.getManager().getFullName(),
                d.getLifecycleStatus(), d.getLastSeenAt(), d.getEdgeSoftwareVersion(), d.getEdgeModelVersion(),
                d.getEdgeCameraStatus(), d.getEdgeRecognitionStatus(), d.getEdgeErrorCode(),
                d.getEdgeLastFrameAt(), d.getEdgeReportedAt(), DeviceLifecyclePolicy.allowed(d),
                d.getPairingCodeHash() != null);
    }
}
