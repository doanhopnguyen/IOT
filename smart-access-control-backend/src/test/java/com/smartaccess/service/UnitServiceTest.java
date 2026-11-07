package com.smartaccess.service;

import com.smartaccess.model.*;
import com.smartaccess.model.enumtype.*;
import com.smartaccess.repository.*;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class UnitServiceTest {
    final AccessUnitRepository units = mock(AccessUnitRepository.class);
    final UserAccessRepository members = mock(UserAccessRepository.class);
    final DeviceRepository devices = mock(DeviceRepository.class);
    final DeviceInventoryRepository inventory = mock(DeviceInventoryRepository.class);
    final LockdownService lockdown = mock(LockdownService.class);
    final UnitService service = new UnitService(mock(AccountRepository.class), units, members, devices,
            mock(FaceRequestRepository.class), mock(ManagerService.class), lockdown);
    final AccessUnit unit = new AccessUnit();
    final Device door = new Device();
    final DeviceInventory state = new DeviceInventory();

    UnitServiceTest() {
        Account owner = new Account(); owner.setAccountId(1L);
        unit.setUnitId(7L); unit.setManager(owner); unit.setRemoteUnlockEnabled(true);
        door.setDeviceId(9L); door.setDeviceUid("door"); door.setAccessUnit(unit);
        door.setLifecycleStatus(DeviceLifecycleStatus.ACTIVE); door.setLastSeenAt(LocalDateTime.now());
        state.setDevice(door); state.setState("ACTIVE"); state.setSetupReady(true);
        ReflectionTestUtils.setField(service, "inventory", inventory);
        when(units.findByManager_AccountIdOrderByUnitId(1L)).thenReturn(List.of(unit));
        when(devices.findFirstByAccessUnit_UnitIdAndDeviceType(7L, DeviceType.DOOR_CONTROLLER)).thenReturn(Optional.of(door));
        when(inventory.findById(9L)).thenReturn(Optional.of(state));
    }

    @Test void lifecycleRestrictionsAreVisibleAndDisableBothRemoteActions() {
        for (var lifecycle : List.of(DeviceLifecycleStatus.SUSPENDED, DeviceLifecycleStatus.MAINTENANCE, DeviceLifecycleStatus.DECOMMISSIONED)) {
            door.setLifecycleStatus(lifecycle);
            var result = service.listMine(1L).get(0);
            assertThat(result.lifecycleStatus()).isEqualTo(lifecycle);
            assertThat(result.online()).isFalse();
            assertThat(result.canRemoteUnlock()).isFalse();
            assertThat(result.canRemoteLock()).isFalse();
        }
    }

    @Test void setupAndResetMustNotExposeRemoteActionsEvenWithOldReadyFlag() {
        for (String phase : List.of("CLAIMED", "RESETTING", "INVENTORY")) {
            state.setState(phase);
            var result = service.listMine(1L).get(0);
            assertThat(result.canRemoteUnlock()).isFalse();
            assertThat(result.canRemoteLock()).isFalse();
        }
    }

    @Test void lockdownBlocksMemberUnlockButAllowsOwnerAndAuthorizedLock() {
        UserAccess member = new UserAccess(); member.setAccessUnit(unit); member.setAllowRemoteUnlock(true);
        when(members.findByAccountWithUnit(2L)).thenReturn(List.of(member));
        when(lockdown.isLockedDown(door)).thenReturn(true);
        assertThat(service.listMine(1L).get(0).canRemoteUnlock()).isTrue();
        var result = service.listMine(2L).get(0);
        assertThat(result.canRemoteUnlock()).isFalse();
        assertThat(result.canRemoteLock()).isTrue();
    }
}
