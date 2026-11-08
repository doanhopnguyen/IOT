package com.smartaccess.service;

import com.smartaccess.exception.BusinessException;
import com.smartaccess.model.AccessUnit;
import com.smartaccess.model.Command;
import com.smartaccess.model.Device;
import com.smartaccess.model.DeviceInventory;
import com.smartaccess.model.enumtype.CommandStatus;
import com.smartaccess.model.enumtype.DeviceType;
import com.smartaccess.repository.CommandRepository;
import com.smartaccess.repository.DeviceInventoryRepository;
import com.smartaccess.repository.DeviceRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class LockdownServiceTest {
    final ManagerAccessGuard guard = mock(ManagerAccessGuard.class);
    final DeviceCommandService dispatcher = mock(DeviceCommandService.class);
    final CommandRepository commands = mock(CommandRepository.class);
    final DeviceInventoryRepository inventory = mock(DeviceInventoryRepository.class);
    final DeviceRepository devices = mock(DeviceRepository.class);
    final LockdownService service = new LockdownService(guard, dispatcher, commands, inventory, devices);
    Device door;
    DeviceInventory item;

    @BeforeEach void setup() {
        AccessUnit unit = new AccessUnit(); unit.setUnitId(3L);
        door = new Device(); door.setDeviceId(9L); door.setDeviceUid("door-9");
        door.setDeviceType(DeviceType.DOOR_CONTROLLER); door.setAccessUnit(unit);
        item = new DeviceInventory(); item.setGeneration(4);
        when(inventory.findById(9L)).thenReturn(Optional.of(item));
        when(guard.requireManagedUnit(7L, 3L)).thenReturn(unit);
        when(guard.requireOnlineController(3L)).thenReturn(door);
        Command created = new Command(); created.setCommandUuid("c-1"); created.setStatus(CommandStatus.PENDING);
        when(dispatcher.dispatch(any(), anyLong(), anyString(), anyMap(), anyMap())).thenReturn(created);
    }

    Command acked(String type, long generation) {
        Command c = new Command(); c.setCommandType(type); c.setStatus(CommandStatus.ACKNOWLEDGED);
        c.setPayload(Map.of("unitId", 3, "generation", (int) generation)); // JSON đọc lại thành Integer
        return c;
    }

    void latest(Command c) {
        when(commands.findFirstByDevice_DeviceIdAndCommandTypeInAndStatusInOrderByCommandIdDesc(eq(9L),
                eq(List.of(LockdownService.DOOR_LOCKDOWN, LockdownService.DOOR_RELEASE, PinAlertResponseService.LOCKDOWN)),
                eq(List.of(CommandStatus.ACKNOWLEDGED, CommandStatus.PENDING, CommandStatus.SENT))))
                .thenReturn(Optional.ofNullable(c));
    }

    @Test void ownerStartsLockdownOnOnlineDoor() {
        service.start(7L, 3L);
        verify(dispatcher).dispatch(door, 7L, "DOOR_LOCKDOWN", Map.of("unitId", 3L, "generation", 4L), Map.of());
    }

    @Test void ownerReleasesLockdown() {
        service.release(7L, 3L);
        verify(dispatcher).dispatch(door, 7L, "DOOR_RELEASE", Map.of("unitId", 3L, "generation", 4L), Map.of());
    }

    @Test void memberCannotStartLockdown() {
        when(guard.requireManagedUnit(8L, 3L)).thenThrow(new BusinessException(HttpStatus.FORBIDDEN, "x"));
        assertThatThrownBy(() -> service.start(8L, 3L)).isInstanceOf(BusinessException.class);
        verifyNoInteractions(dispatcher);
    }

    @Test void pendingLockdownCommandIsConflict() {
        when(commands.existsByDevice_DeviceIdAndCommandTypeAndStatusIn(9L, LockdownService.DOOR_RELEASE,
                List.of(CommandStatus.PENDING, CommandStatus.SENT))).thenReturn(true);
        assertThatThrownBy(() -> service.start(7L, 3L)).isInstanceOf(BusinessException.class)
                .hasMessage("Cửa đang xử lý lệnh khóa trước đó")
                .extracting("status").isEqualTo(HttpStatus.CONFLICT);
        verifyNoInteractions(dispatcher);
    }

    @Test void lockedWhenLatestAckedIsLockdownOfCurrentGeneration() {
        latest(acked("DOOR_LOCKDOWN", 4));
        assertThat(service.isLockedDown(door)).isTrue();
    }

    @Test void lockdownStillWaitingForAckCountsAsLocked() {
        Command sent = acked("DOOR_LOCKDOWN", 4); sent.setStatus(CommandStatus.SENT);
        latest(sent); // heartbeat có thể tới trước ACK: config không được gỡ khóa chip vừa khóa
        assertThat(service.isLockedDown(door)).isTrue();
    }

    @Test void notLockedAfterRelease() {
        latest(acked("DOOR_RELEASE", 4));
        assertThat(service.isLockedDown(door)).isFalse();
    }
    @Test void pinAlertLockdownKeepsTheNormalLockdownPolicy(){
        latest(acked(PinAlertResponseService.LOCKDOWN,4));
        assertThat(service.isLockedDown(door)).isTrue();
    }

    @Test void notLockedAfterResetToNewGeneration() {
        latest(acked("DOOR_LOCKDOWN", 4));
        item.setGeneration(5);
        assertThat(service.isLockedDown(door)).isFalse();
    }

    @Test void notLockedWithoutAnyCommand() {
        latest(null);
        assertThat(service.isLockedDown(door)).isFalse();
    }

    @Test void unitWithoutControllerIsNotLocked() {
        when(devices.findFirstByAccessUnit_UnitIdAndDeviceType(5L, DeviceType.DOOR_CONTROLLER)).thenReturn(Optional.empty());
        assertThat(service.isLockedDown(5L)).isFalse();
    }
}
