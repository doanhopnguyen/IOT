package com.smartaccess.service;

import com.smartaccess.exception.BusinessException;
import com.smartaccess.model.AccessUnit;
import com.smartaccess.model.Device;
import com.smartaccess.model.UserAccessId;
import com.smartaccess.model.enumtype.DeviceLifecycleStatus;
import com.smartaccess.model.enumtype.DeviceType;
import com.smartaccess.repository.AccessUnitRepository;
import com.smartaccess.repository.DeviceInventoryRepository;
import com.smartaccess.repository.DeviceRepository;
import com.smartaccess.repository.UserAccessRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import java.time.LocalDateTime;

@Component
public class ManagerAccessGuard {
    @org.springframework.beans.factory.annotation.Autowired(required=false)
    private com.smartaccess.repository.CommandRepository commands;
    // Thiết bị được coi là online nếu có heartbeat trong 90 giây gần nhất
    static final long ONLINE_WINDOW_SEC = 90;

    private final AccessUnitRepository units;
    private final UserAccessRepository memberships;
    private final DeviceRepository devices;
    private final DeviceInventoryRepository inventory;

    public ManagerAccessGuard(AccessUnitRepository units, UserAccessRepository memberships,
            DeviceRepository devices, DeviceInventoryRepository inventory) {
        this.units = units;
        this.memberships = memberships;
        this.devices = devices;
        this.inventory = inventory;
    }

    public AccessUnit requireManagedUnit(Long managerId, Long unitId) {
        AccessUnit unit = units.findById(unitId)
                .orElseThrow(() -> new BusinessException(HttpStatus.NOT_FOUND, "Cửa không tồn tại"));
        if (unit.getManager() == null || !unit.getManager().getAccountId().equals(managerId)) {
            throw new BusinessException(HttpStatus.FORBIDDEN, "Bạn không có quyền quản lý cửa này");
        }
        return unit;
    }

    public AccessUnit requireRemoteUnit(Long accountId, Long unitId) {
        AccessUnit unit = units.findById(unitId)
                .orElseThrow(() -> new BusinessException(HttpStatus.NOT_FOUND, "Cửa không tồn tại"));
        if (unit.getManager() != null && unit.getManager().getAccountId().equals(accountId)) return unit;
        boolean allowed = memberships.findById(new UserAccessId(accountId, unitId))
                .filter(m -> m.getAccount().getStatus() == com.smartaccess.model.enumtype.AccountStatus.ACTIVE)
                .map(com.smartaccess.model.UserAccess::isAllowRemoteUnlock).orElse(false);
        if (!allowed) throw new BusinessException(HttpStatus.FORBIDDEN, "Bạn không có quyền mở cửa từ xa");
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
        if (inventory.findById(device.getDeviceId()).map(i -> "RESETTING".equals(i.getState())).orElse(false))
            throw new BusinessException(HttpStatus.CONFLICT, "Cửa đang reset; chờ hoàn tất trước khi gửi lệnh khác");
        if(commands!=null && commands.existsByDevice_DeviceIdAndCommandTypeAndStatusIn(device.getDeviceId(),FirmwareUpdateService.COMMAND,FirmwareUpdateService.IN_FLIGHT))
            throw new BusinessException(HttpStatus.CONFLICT,"Cửa đang cập nhật firmware; chờ cửa khởi động lại trước khi gửi lệnh khác");
        LocalDateTime limit = LocalDateTime.now().minusSeconds(ONLINE_WINDOW_SEC);
        if (device.getLifecycleStatus() != DeviceLifecycleStatus.ACTIVE
                || device.getLastSeenAt() == null
                || device.getLastSeenAt().isBefore(limit)) {
            throw new BusinessException(HttpStatus.SERVICE_UNAVAILABLE, "Không kết nối được thiết bị");
        }
        return device;
    }

    /** Thiết bị online và đã thiết lập xong tại cửa (PIN + phần cứng sẵn sàng), dùng cho lệnh mở cửa. */
    public Device requireReadyController(Long unitId) {
        Device device = requireOnlineController(unitId);
        inventory.findById(device.getDeviceId()).ifPresent(i -> {
            if (!i.isSetupReady() || !"ACTIVE".equals(i.getState()))
                throw new BusinessException(HttpStatus.CONFLICT, "Cửa chưa thiết lập xong hoặc đang reset");
        });
        return device;
    }
}
