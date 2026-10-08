package com.smartaccess.service;

import com.smartaccess.dto.manager.*;
import com.smartaccess.exception.BusinessException;
import com.smartaccess.model.*;
import com.smartaccess.model.enumtype.*;
import com.smartaccess.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import java.util.List;
import java.util.Optional;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ManagerServiceTest {
    @Mock AccountRepository accounts;
    @Mock AccessUnitRepository units;
    @Mock UserAccessRepository memberships;
    @Mock DeviceRepository devices;
    @Mock AuditLogRepository audits;
    @Mock FaceRequestRepository faceRequests;
    ManagerService service;
    Account manager;
    Account user;
    AccessUnit unit;
    UserAccess member;
    Device device;

    @BeforeEach
    void setup() {
        service = new ManagerService(accounts, units, memberships, devices, audits, faceRequests);
        manager = account(1L, "Manager");
        user = account(2L, "Member");
        unit = new AccessUnit(); unit.setUnitId(10L); unit.setUnitName("Door 10"); unit.setManager(manager);
        member = new UserAccess(); member.setAccount(user); member.setAccessUnit(unit);
        member.setId(new UserAccessId(2L, 10L));
        member.setAllowFace(true); member.setAllowFingerprint(true); member.setAllowRfid(true); member.setAllowRemoteUnlock(true);
        device = new Device(); device.setDeviceId(30L); device.setDeviceUid("SD-001-ABC");
        device.setDeviceName("Door device"); device.setDeviceType(DeviceType.DOOR_CONTROLLER);
    }

    Account account(Long id, String name) {
        Account account = new Account(); account.setAccountId(id); account.setFullName(name);
        account.setEmail(name.toLowerCase() + "@example.test"); account.setPasswordHash("NEVER-EXPOSE");
        return account;
    }

    void managed(boolean lock) {
        when(accounts.findById(1L)).thenReturn(Optional.of(manager));
        if (lock) when(units.findForUpdate(10L)).thenReturn(Optional.of(unit));
        else when(units.findById(10L)).thenReturn(Optional.of(unit));
    }

    void member() {
        managed(true);
        when(accounts.findById(2L)).thenReturn(Optional.of(user));
        when(memberships.findById(new UserAccessId(2L, 10L))).thenReturn(Optional.of(member));
    }

    void searching() {
        when(accounts.findById(1L)).thenReturn(Optional.of(manager));
        when(units.existsByManager_AccountId(1L)).thenReturn(true);
    }

    @Test void searchesNumericAccountWithSafeDto() {
        searching(); when(accounts.findById(2L)).thenReturn(Optional.of(user));
        assertThat(service.searchUsers(1L, "2", "account"))
                .containsExactly(new UserSearchResponse(2L, "2", "member@example.test", "Member", AccountStatus.ACTIVE));
    }

    @Test void searchesEmail() {
        searching(); when(accounts.findByEmailIgnoreCase("MEMBER@example.test")).thenReturn(Optional.of(user));
        assertThat(service.searchUsers(1L, " MEMBER@example.test ", "email")).hasSize(1);
    }

    @Test void searchWithoutMatchReturnsEmpty() {
        searching(); assertThat(service.searchUsers(1L, "missing@example.test", "auto")).isEmpty();
    }

    @ParameterizedTest @ValueSource(strings = {"", " ", "abc", "0", "-2", "9999999999999999999999999"})
    void invalidAccountSearchIs400(String keyword) {
        searching(); assertStatus(() -> service.searchUsers(1L, keyword, "account"), HttpStatus.BAD_REQUEST);
    }

    @Test void searchRejectsUnsupportedType() {
        searching(); assertStatus(() -> service.searchUsers(1L, "2", "phone"), HttpStatus.BAD_REQUEST);
    }

    @Test void searchRequiresManager() {
        when(accounts.findById(1L)).thenReturn(Optional.of(manager));
        assertStatus(() -> service.searchUsers(1L, "2", "account"), HttpStatus.FORBIDDEN);
    }

    @Test void missingManagerIs404() {
        assertStatus(() -> service.getUsers(1L, 10L), HttpStatus.NOT_FOUND);
        verifyNoInteractions(units, memberships);
    }

    @Test void missingUnitIs404() {
        when(accounts.findById(1L)).thenReturn(Optional.of(manager));
        assertStatus(() -> service.getUsers(1L, 10L), HttpStatus.NOT_FOUND);
    }

    @Test void anotherManagerCannotReadMembers() {
        managed(false); unit.setManager(account(99L, "Other"));
        assertStatus(() -> service.getUsers(1L, 10L), HttpStatus.FORBIDDEN);
        verifyNoInteractions(memberships);
    }

    @Test void unassignedUnitCannotBeManaged() {
        managed(false); unit.setManager(null);
        assertStatus(() -> service.getUsers(1L, 10L), HttpStatus.FORBIDDEN);
    }

    @Test void listsOnlyRequestedUnit() {
        managed(false); when(memberships.findMembersByUnitId(10L)).thenReturn(List.of(member));
        assertThat(service.getUsers(1L, 10L)).extracting(UnitUserResponse::userId).containsExactly(2L);
        verify(memberships).findMembersByUnitId(10L);
    }

    @ParameterizedTest @ValueSource(ints = {0, 1, 2, 3})
    void revokesEachPermissionWithoutChangingOthers(int index) {
        member();
        Boolean[] values = new Boolean[4]; values[index] = false;
        var response = service.updatePermissions(1L, 10L, 2L, new PermissionRequest(values[0], values[1], values[2], values[3]));
        boolean[] actual = {response.allowFace(), response.allowFingerprint(), response.allowRfid(), response.allowRemoteUnlock()};
        for (int i = 0; i < 4; i++) assertThat(actual[i]).isEqualTo(i != index);
        var audit = ArgumentCaptor.forClass(AuditLog.class); verify(audits).save(audit.capture());
        assertThat(audit.getValue().getAction()).isEqualTo("REVOKE_PERMISSION");
        assertThat(audit.getValue().getDetails()).containsEntry("unitId", 10L).containsEntry("accountId", 2L);
        verify(accounts, never()).delete(any());
        verify(memberships, never()).delete(any());
    }

    @ParameterizedTest @ValueSource(ints = {0, 1, 2, 3})
    void cannotGrantAnyPermissionWithoutInvitationProof(int index) {
        member(); Boolean[] values = new Boolean[4]; values[index] = true;
        assertStatus(() -> service.updatePermissions(1L, 10L, 2L,
                new PermissionRequest(values[0], values[1], values[2], values[3])), HttpStatus.CONFLICT);
        verify(memberships, never()).save(any()); verifyNoInteractions(audits);
    }

    @Test void mixedGrantAndRevokeDoesNotPartiallyRevoke() {
        member(); assertStatus(() -> service.updatePermissions(1L, 10L, 2L,
                new PermissionRequest(false, true, null, null)), HttpStatus.CONFLICT);
        assertThat(member.isAllowFace()).isTrue(); verifyNoInteractions(audits);
    }

    @Test void cannotGrantToNonMember() {
        managed(true); when(accounts.findById(2L)).thenReturn(Optional.of(user));
        assertStatus(() -> service.updatePermissions(1L, 10L, 2L,
                new PermissionRequest(true, null, null, null)), HttpStatus.CONFLICT);
        verify(memberships, never()).save(any());
    }

    @Test void permissionRequestCannotBeEmpty() {
        member(); assertStatus(() -> service.updatePermissions(1L, 10L, 2L,
                new PermissionRequest(null, null, null, null)), HttpStatus.BAD_REQUEST);
    }

    @Test void removesOnlyMembershipAndPreservesAccountAndOtherDoor() {
        member(); service.removeUser(1L, 10L, 2L);
        verify(memberships).delete(member); verify(memberships).flush();
        verify(accounts, never()).delete(any()); verify(memberships, never()).deleteById(new UserAccessId(2L, 11L));
        var audit = ArgumentCaptor.forClass(AuditLog.class); verify(audits).save(audit.capture());
        assertThat(audit.getValue().getAction()).isEqualTo("REMOVE_USER_FROM_UNIT");
    }

    @Test void removalWithHistoryFailsWithoutDeletingHistoryOrChangingPermissions() {
        member(); when(faceRequests.existsByAccount_AccountIdAndAccessUnit_UnitId(2L, 10L)).thenReturn(true);
        assertStatus(() -> service.removeUser(1L, 10L, 2L), HttpStatus.CONFLICT);
        verify(memberships, never()).delete(any()); verifyNoInteractions(audits);
        assertThat(member.isAllowFace()).isTrue();
    }

    @Test void removalOfNonMemberIs404() {
        managed(true); when(accounts.findById(2L)).thenReturn(Optional.of(user));
        assertStatus(() -> service.removeUser(1L, 10L, 2L), HttpStatus.NOT_FOUND);
    }

    @Test void missingUserIs404() {
        managed(true); assertStatus(() -> service.removeUser(1L, 10L, 2L), HttpStatus.NOT_FOUND);
    }

    @Test void cannotModifyAdminMembership() {
        member(); user.setAdmin(true);
        assertStatus(() -> service.removeUser(1L, 10L, 2L), HttpStatus.FORBIDDEN);
    }

    @Test void cannotModifyAnotherManagerMembership() {
        member(); when(units.existsByManager_AccountId(2L)).thenReturn(true);
        assertStatus(() -> service.updatePermissions(1L, 10L, 2L,
                new PermissionRequest(false, null, null, null)), HttpStatus.FORBIDDEN);
    }

    @Test void registersExistingUnassignedDeviceAndAudits() {
        managed(true); when(devices.findByDeviceUidForUpdate("SD-001-ABC")).thenReturn(Optional.of(device));
        var response = service.registerDevice(1L, 10L, new RegisterDeviceRequest(" SD-001-ABC "));
        assertThat(response.unitId()).isEqualTo(10L); assertThat(device.getAccessUnit()).isSameAs(unit);
        verify(devices).save(device);
        var audit = ArgumentCaptor.forClass(AuditLog.class); verify(audits).save(audit.capture());
        assertThat(audit.getValue().getAction()).isEqualTo("REGISTER_DEVICE");
    }

    @Test void missingDeviceIs404() {
        managed(true); assertStatus(() -> service.registerDevice(1L, 10L, new RegisterDeviceRequest("missing")), HttpStatus.NOT_FOUND);
    }

    @ParameterizedTest @ValueSource(longs = {10L, 11L})
    void cannotRegisterDeviceAlreadyAssignedToAnyDoor(Long assignedUnitId) {
        managed(true); AccessUnit assigned = new AccessUnit(); assigned.setUnitId(assignedUnitId); device.setAccessUnit(assigned);
        when(devices.findByDeviceUidForUpdate("SD-001-ABC")).thenReturn(Optional.of(device));
        assertStatus(() -> service.registerDevice(1L, 10L, new RegisterDeviceRequest("SD-001-ABC")), HttpStatus.CONFLICT);
        assertThat(device.getAccessUnit()).isSameAs(assigned); verify(devices, never()).save(any());
    }

    @ParameterizedTest @EnumSource(value = DeviceLifecycleStatus.class, names = {"SUSPENDED", "DECOMMISSIONED", "MAINTENANCE"})
    void cannotRegisterInvalidLifecycle(DeviceLifecycleStatus status) {
        managed(true); device.setLifecycleStatus(status);
        when(devices.findByDeviceUidForUpdate("SD-001-ABC")).thenReturn(Optional.of(device));
        assertStatus(() -> service.registerDevice(1L, 10L, new RegisterDeviceRequest("SD-001-ABC")), HttpStatus.CONFLICT);
        verify(devices, never()).save(any());
    }

    @Test void foreignManagerCannotMutateDevices() {
        managed(true); unit.setManager(account(99L, "Other"));
        assertStatus(() -> service.registerDevice(1L, 10L, new RegisterDeviceRequest("SD-001-ABC")), HttpStatus.FORBIDDEN);
        verifyNoInteractions(devices, audits);
    }

    @Test void foreignManagerCannotRevokePermissions() {
        managed(true); unit.setManager(account(99L, "Other"));
        assertStatus(() -> service.updatePermissions(1L, 10L, 2L,
                new PermissionRequest(false, null, null, null)), HttpStatus.FORBIDDEN);
        verifyNoInteractions(memberships, audits);
    }

    @Test void foreignManagerCannotRemoveMember() {
        managed(true); unit.setManager(account(99L, "Other"));
        assertStatus(() -> service.removeUser(1L, 10L, 2L), HttpStatus.FORBIDDEN);
        verifyNoInteractions(memberships, faceRequests, audits);
    }

    void assertStatus(Runnable action, HttpStatus status) {
        assertThatThrownBy(action::run).isInstanceOfSatisfying(BusinessException.class,
                exception -> assertThat(exception.getStatus()).isEqualTo(status));
    }
}
