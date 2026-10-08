package com.smartaccess.dto.manager;

import com.smartaccess.model.Device;
import com.smartaccess.model.enumtype.DeviceLifecycleStatus;
import com.smartaccess.model.enumtype.DeviceType;

public record DeviceResponse(Long deviceId, String deviceCode, String deviceName, Long unitId,
        DeviceType deviceType, DeviceLifecycleStatus lifecycleStatus) {
    public static DeviceResponse from(Device device) {
        return new DeviceResponse(device.getDeviceId(), device.getDeviceUid(), device.getDeviceName(),
                device.getAccessUnit().getUnitId(), device.getDeviceType(), device.getLifecycleStatus());
    }
}
