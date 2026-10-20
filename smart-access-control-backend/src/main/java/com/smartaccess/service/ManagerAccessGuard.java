package com.smartaccess.service;

import com.smartaccess.exception.BusinessException;
import com.smartaccess.model.AccessUnit;
import com.smartaccess.model.Device;
import com.smartaccess.model.UserAccessId;
import com.smartaccess.model.enumtype.DeviceLifecycleStatus;
import com.smartaccess.model.enumtype.DeviceType;
import com.smartaccess.repository.AccessUnitRepository;
import com.smartaccess.repository.DeviceRepository;
import com.smartaccess.repository.UserAccessRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import java.time.LocalDateTime;

@Component
public class ManagerAccessGuard {
    // Thiết bị được coi là online nếu có heartbeat trong 90 giây gần nhất
    static final long ONLINE_WINDOW_SEC = 90;

    private final AccessUnitRepository units;
    private final UserAccessRepository memberships;
    private final DeviceRepository devices;

    public ManagerAccessGuard(AccessUnitRepository units, UserAccessRepository memberships,
            DeviceRepository devices) {
        this.units = units;
        this.memberships = memberships;
        this.devices = devices;
    }

    public AccessUnit requireManagedUnit(Long managerId, Long unitId) {
        AccessUnit unit = units.findById(unitId)
                .orElseThrow(() -> new BusinessException(HttpStatus.NOT_FOUND, "Cửa không tồn tại"));
        if (unit.getManager() == null || !unit.getManager().getAccountId().equals(managerId)) {
            throw new BusinessException(HttpStatus.FORBIDDEN, "Bạn không có quyền quản lý cửa này");
        }
        return unit;
    }

    public void requireUserOfUnit(Long accountId, Long unitId) {
        if (!memberships.existsById(new UserAccessId(accountId, unitId))) {
            throw new BusinessException(HttpStatus.NOT_FOUND, "Người dùng không còn quyền truy cập cửa này");
        }
    }

    public Device requireOnlineController(Long unitId) {
        Device device = devices.findFirstByAccessUnit_UnitIdAndDeviceType(unitId, DeviceType.DOOR_CONTROLLER)
                .orElseThrow(() -> new BusinessException(HttpStatus.NOT_FOUND, "Cửa chưa được gắn thiết bị"));
        LocalDateTime limit = LocalDateTime.now().minusSeconds(ONLINE_WINDOW_SEC);
        if (device.getLifecycleStatus() != DeviceLifecycleStatus.ACTIVE
                || device.getLastSeenAt() == null
                || device.getLastSeenAt().isBefore(limit)) {
            throw new BusinessException(HttpStatus.SERVICE_UNAVAILABLE, "Không kết nối được thiết bị");
        }
        return device;
    }
}
