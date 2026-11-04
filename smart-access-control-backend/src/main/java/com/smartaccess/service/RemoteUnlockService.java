package com.smartaccess.service;

import com.smartaccess.dto.manager.CommandResponse;
import com.smartaccess.exception.BusinessException;
import com.smartaccess.model.AccessUnit;
import com.smartaccess.model.Device;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.Map;

@Service
public class RemoteUnlockService {
    @org.springframework.beans.factory.annotation.Autowired(required=false)
    private com.smartaccess.repository.DeviceInventoryRepository inventory;
    public static final String DOOR_UNLOCK = "DOOR_UNLOCK";
    // Thiết bị bỏ qua lệnh mở cửa đã quá thời gian này
    public static final int UNLOCK_TTL_SEC = 10;

    private final ManagerAccessGuard guard;
    private final DeviceCommandService commands;

    public RemoteUnlockService(ManagerAccessGuard guard, DeviceCommandService commands) {
        this.guard = guard;
        this.commands = commands;
    }

    @Transactional
    public CommandResponse unlock(Long managerId, Long unitId) {
        AccessUnit unit = guard.requireRemoteUnit(managerId, unitId);
        if (!unit.isRemoteUnlockEnabled()) {
            throw new BusinessException(HttpStatus.CONFLICT, "Cửa này đang tắt chức năng mở từ xa");
        }
        Device device = guard.requireOnlineController(unitId);
        if(inventory!=null)inventory.findById(device.getDeviceId()).ifPresent(i->{
            if(!i.isSetupReady()||!"ACTIVE".equals(i.getState()))throw new BusinessException(HttpStatus.CONFLICT,"Cửa chưa thiết lập xong hoặc đang reset");
        });

        Map<String, Object> payload = Map.of("unitId", unitId);
        Map<String, Object> wireData = Map.of(
                "durationSec", unit.getUnlockDurationSec().intValue(),
                "issuedAt", Instant.now().getEpochSecond(),
                "ttlSec", UNLOCK_TTL_SEC);
        return CommandResponse.from(commands.dispatch(device, managerId, DOOR_UNLOCK, payload, wireData));
    }
}
