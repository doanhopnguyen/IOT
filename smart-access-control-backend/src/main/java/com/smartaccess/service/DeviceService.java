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

    /**
     * Heartbeat: đánh dấu thiết bị online để ManagerAccessGuard cho phép gửi lệnh.
     * Trả true khi người dùng thấy được thay đổi: thiết bị vừa online trở lại hoặc vừa chuyển ACTIVE.
     */
    @Transactional
    public boolean touch(String deviceUid) {
        var found = devices.findByDeviceUid(deviceUid);
        if (found.isEmpty()) {
            log.warn("Bỏ qua tin nhắn từ thiết bị chưa đăng ký {}", deviceUid);
            return false;
        }
        var device = found.get();
        LocalDateTime now = LocalDateTime.now();
        boolean changed = device.getLastSeenAt() == null
                || device.getLastSeenAt().isBefore(now.minusSeconds(ManagerAccessGuard.ONLINE_WINDOW_SEC));
        if (device.getLifecycleStatus() == DeviceLifecycleStatus.REGISTERED
                || device.getLifecycleStatus() == DeviceLifecycleStatus.PROVISIONED) {
            device.setLifecycleStatus(DeviceLifecycleStatus.ACTIVE);
            changed = true;
        }
        device.setLastSeenAt(now);
        return changed;
    }
}
