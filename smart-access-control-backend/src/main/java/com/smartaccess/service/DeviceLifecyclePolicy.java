package com.smartaccess.service;

import com.smartaccess.model.Device;
import com.smartaccess.model.enumtype.DeviceLifecycleStatus;
import java.util.Arrays;
import java.util.List;

/** The same available transitions are returned to admin clients and enforced on writes. */
public final class DeviceLifecyclePolicy {
    private DeviceLifecyclePolicy() {}
    public static List<DeviceLifecycleStatus> allowed(Device device) {
        if (device.getLifecycleStatus() == DeviceLifecycleStatus.DECOMMISSIONED) return List.of();
        boolean hasOwner = device.getAccessUnit() != null && device.getAccessUnit().getManager() != null;
        if (device.getDeviceType() == com.smartaccess.model.enumtype.DeviceType.FACE_CAMERA_NODE) {
            return (hasOwner ? List.of(DeviceLifecycleStatus.ACTIVE, DeviceLifecycleStatus.SUSPENDED, DeviceLifecycleStatus.DECOMMISSIONED)
                    : List.of(DeviceLifecycleStatus.DECOMMISSIONED)).stream()
                    .filter(status -> status != device.getLifecycleStatus()).toList();
        }
        return Arrays.stream(DeviceLifecycleStatus.values())
                .filter(status -> status != device.getLifecycleStatus())
                .filter(status -> hasOwner || (status != DeviceLifecycleStatus.ACTIVE && status != DeviceLifecycleStatus.PROVISIONED))
                .toList();
    }
}
