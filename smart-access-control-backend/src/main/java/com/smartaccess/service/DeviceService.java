package com.smartaccess.service;

import com.smartaccess.model.enumtype.DeviceLifecycleStatus;
import com.smartaccess.repository.DeviceRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;

@Service
public class DeviceService {
    private static final Logger log = LoggerFactory.getLogger(DeviceService.class);

    private final DeviceRepository devices;

    public DeviceService(DeviceRepository devices) { this.devices = devices; }

    // Heartbeat: đánh dấu thiết bị online để ManagerAccessGuard cho phép gửi lệnh
    @Transactional
    public void touch(String deviceUid) {
        devices.findByDeviceUid(deviceUid).ifPresentOrElse(device -> {
            if (device.getLifecycleStatus() == DeviceLifecycleStatus.REGISTERED
                    || device.getLifecycleStatus() == DeviceLifecycleStatus.PROVISIONED) {
                device.setLifecycleStatus(DeviceLifecycleStatus.ACTIVE);
            }
            device.setLastSeenAt(LocalDateTime.now());
        }, () -> log.warn("Bỏ qua tin nhắn từ thiết bị chưa đăng ký {}", deviceUid));
    }
}
