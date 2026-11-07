package com.smartaccess.service;

import com.smartaccess.dto.manager.CommandResponse;
import com.smartaccess.exception.BusinessException;
import com.smartaccess.model.Device;
import com.smartaccess.model.DeviceInventory;
import com.smartaccess.model.enumtype.CommandStatus;
import com.smartaccess.model.enumtype.DeviceType;
import com.smartaccess.repository.CommandRepository;
import com.smartaccess.repository.DeviceInventoryRepository;
import com.smartaccess.repository.DeviceRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.Map;

/**
 * Chủ cửa tạm khóa cửa: chip từ chối mọi lượt mở trừ vân tay/thẻ của chủ cửa.
 * Không có cột riêng: trạng thái là lệnh DOOR_LOCKDOWN/DOOR_RELEASE gần nhất (đã ACK hoặc đang chờ) của generation hiện tại,
 * nên reset/chuyển giao (generation mới) tự bỏ khóa.
 */
@Service
public class LockdownService {
    public static final String DOOR_LOCKDOWN = "DOOR_LOCKDOWN";
    public static final String DOOR_RELEASE = "DOOR_RELEASE";
    private static final List<String> TYPES = List.of(DOOR_LOCKDOWN, DOOR_RELEASE);
    private static final List<CommandStatus> EFFECTIVE = List.of(CommandStatus.ACKNOWLEDGED, CommandStatus.PENDING, CommandStatus.SENT);

    private final ManagerAccessGuard guard;
    private final DeviceCommandService dispatcher;
    private final CommandRepository commands;
    private final DeviceInventoryRepository inventory;
    private final DeviceRepository devices;

    public LockdownService(ManagerAccessGuard guard, DeviceCommandService dispatcher, CommandRepository commands,
            DeviceInventoryRepository inventory, DeviceRepository devices) {
        this.guard = guard; this.dispatcher = dispatcher; this.commands = commands;
        this.inventory = inventory; this.devices = devices;
    }

    @Transactional
    public CommandResponse start(Long managerId, Long unitId) { return send(managerId, unitId, DOOR_LOCKDOWN); }

    @Transactional
    public CommandResponse release(Long managerId, Long unitId) { return send(managerId, unitId, DOOR_RELEASE); }

    @Transactional(readOnly = true)
    public Map<String, Boolean> status(Long managerId, Long unitId) {
        guard.requireManagedUnit(managerId, unitId);
        return Map.of("lockedDown", isLockedDown(unitId));
    }

    @Transactional(readOnly = true)
    public boolean isLockedDown(Long unitId) {
        return devices.findFirstByAccessUnit_UnitIdAndDeviceType(unitId, DeviceType.DOOR_CONTROLLER)
                .map(this::isLockedDown).orElse(false);
    }

    @Transactional(readOnly = true)
    public boolean isLockedDown(Device device) {
        long generation = generation(device);
        // Lệnh đang chờ ACK là trạng thái mong muốn: heartbeat có thể tới trước ACK. Lệnh FAILED/TIMEOUT bị bỏ qua.
        return commands.findFirstByDevice_DeviceIdAndCommandTypeInAndStatusInOrderByCommandIdDesc(
                        device.getDeviceId(), TYPES, EFFECTIVE)
                .filter(c -> DOOR_LOCKDOWN.equals(c.getCommandType()))
                .filter(c -> c.getPayload() != null && c.getPayload().get("generation") instanceof Number n
                        && n.longValue() == generation)
                .isPresent();
    }

    private CommandResponse send(Long managerId, Long unitId, String type) {
        guard.requireManagedUnit(managerId, unitId);
        Device device = guard.requireOnlineController(unitId);
        for (String pending : TYPES)
            if (commands.existsByDevice_DeviceIdAndCommandTypeAndStatusIn(device.getDeviceId(), pending,
                    List.of(CommandStatus.PENDING, CommandStatus.SENT)))
                throw new BusinessException(HttpStatus.CONFLICT, "Cửa đang xử lý lệnh khóa trước đó");
        Map<String, Object> payload = Map.of("unitId", unitId, "generation", generation(device));
        return CommandResponse.from(dispatcher.dispatch(device, managerId, type, payload, Map.of()));
    }

    private long generation(Device device) {
        return inventory.findById(device.getDeviceId()).map(DeviceInventory::getGeneration).orElse(0L);
    }
}
