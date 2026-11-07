package com.smartaccess.service;

import com.smartaccess.exception.BusinessException;
import com.smartaccess.model.Account;
import com.smartaccess.model.AccessUnit;
import com.smartaccess.model.Command;
import com.smartaccess.model.Device;
import com.smartaccess.model.enumtype.CommandStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class RemoteUnlockServiceTest {
    final ManagerAccessGuard guard = mock(ManagerAccessGuard.class);
    final DeviceCommandService dispatcher = mock(DeviceCommandService.class);
    final LockdownService lockdown = mock(LockdownService.class);
    final RemoteUnlockService service = new RemoteUnlockService(guard, dispatcher, lockdown);
    Device door;

    @BeforeEach void setup() {
        Account owner = new Account(); owner.setAccountId(1L);
        AccessUnit unit = new AccessUnit(); unit.setUnitId(3L); unit.setManager(owner);
        unit.setRemoteUnlockEnabled(true); unit.setUnlockDurationSec((short) 5);
        door = new Device(); door.setDeviceId(9L);
        when(guard.requireRemoteUnit(anyLong(), eq(3L))).thenReturn(unit);
        when(guard.requireReadyController(3L)).thenReturn(door);
        when(lockdown.isLockedDown(door)).thenReturn(true);
        Command c = new Command(); c.setCommandUuid("c"); c.setStatus(CommandStatus.PENDING);
        when(dispatcher.dispatch(any(), anyLong(), anyString(), anyMap(), anyMap())).thenReturn(c);
    }

    @Test void memberUnlockRejectedDuringLockdown() {
        assertThatThrownBy(() -> service.unlock(2L, 3L)).isInstanceOf(BusinessException.class)
                .hasMessage("Cửa đang tạm khóa; chỉ chủ cửa mở được")
                .extracting("status").isEqualTo(HttpStatus.CONFLICT);
        verifyNoInteractions(dispatcher);
    }

    @Test void ownerUnlocksDuringLockdown() {
        service.unlock(1L, 3L);
        verify(dispatcher).dispatch(eq(door), eq(1L), eq(RemoteUnlockService.DOOR_UNLOCK), anyMap(), anyMap());
    }

    @Test void memberCanStillLockDuringLockdown() {
        service.lock(2L, 3L);
        verify(dispatcher).dispatch(eq(door), eq(2L), eq(RemoteUnlockService.DOOR_LOCK), anyMap(), anyMap());
    }
}
