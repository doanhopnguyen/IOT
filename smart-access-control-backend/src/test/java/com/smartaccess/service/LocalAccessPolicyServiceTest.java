package com.smartaccess.service;

import com.smartaccess.model.*;
import com.smartaccess.model.enumtype.*;
import com.smartaccess.repository.*;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class LocalAccessPolicyServiceTest {
    @Test
    void snapshotFiltersLockedAccountsRevokedMembershipAndDisabledMethods() {
        DeviceRepository devices = mock(DeviceRepository.class);
        CredentialRepository credentials = mock(CredentialRepository.class);
        UserAccessRepository memberships = mock(UserAccessRepository.class);
        AccessUnit unit = new AccessUnit(); unit.setUnitId(1L);
        Device device = new Device(); device.setDeviceId(2L); device.setAccessUnit(unit);
        when(devices.findByDeviceUid("door")).thenReturn(Optional.of(device));
        Account active = new Account(); active.setAccountId(3L);
        Account locked = new Account(); locked.setAccountId(4L); locked.setStatus(AccountStatus.DISABLED);
        Account removed = new Account(); removed.setAccountId(5L);
        UserAccess a = new UserAccess(); a.setAccount(active); a.setAllowRfid(true); a.setAllowFingerprint(false);
        UserAccess b = new UserAccess(); b.setAccount(locked); b.setAllowRfid(true);
        when(memberships.findMembersByUnitId(1L)).thenReturn(List.of(a,b));
        Credential c = card(active, "AA:BB"), d = card(locked, "CC:DD"), e = card(removed, "EE:FF");
        Credential fp = card(active, null); fp.setLocalTemplateId((short) 7);
        when(credentials.findByDevice_DeviceIdAndCredentialTypeAndStatus(2L, CredentialType.RFID, CredentialStatus.ACTIVE))
                .thenReturn(List.of(c,d,e));
        when(credentials.findByDevice_DeviceIdAndCredentialTypeAndStatus(2L, CredentialType.FINGERPRINT, CredentialStatus.ACTIVE))
                .thenReturn(List.of(fp));
        var service = new LocalAccessPolicyService(devices, credentials, memberships, mock(LockdownService.class));
        assertThat((List<?>)service.snapshot("door").get("rfid")).isEqualTo(List.of("AA:BB"));
        assertThat((List<?>)service.snapshot("door").get("fingerprints")).isEmpty();
        unit.setRfidEnabled(false);
        assertThat((List<?>)service.snapshot("door").get("rfid")).isEmpty();
        assertThat(service.snapshot("door")).doesNotContainKeys("accessPinHash", "passwordHash", "deviceSecret");
    }
    @Test
    void snapshotMarksOwnerCredentialsAndLockdown() {
        DeviceRepository devices = mock(DeviceRepository.class);
        CredentialRepository credentials = mock(CredentialRepository.class);
        UserAccessRepository memberships = mock(UserAccessRepository.class);
        LockdownService lockdown = mock(LockdownService.class);
        Account owner = new Account(); owner.setAccountId(1L);
        Account member = new Account(); member.setAccountId(2L);
        AccessUnit unit = new AccessUnit(); unit.setUnitId(1L); unit.setManager(owner);
        Device device = new Device(); device.setDeviceId(2L); device.setAccessUnit(unit);
        when(devices.findByDeviceUid("door")).thenReturn(Optional.of(device));
        when(lockdown.isLockedDown(device)).thenReturn(true);
        UserAccess a = new UserAccess(); a.setAccount(owner); a.setAllowRfid(true); a.setAllowFingerprint(true);
        UserAccess b = new UserAccess(); b.setAccount(member); b.setAllowRfid(true); b.setAllowFingerprint(true);
        when(memberships.findMembersByUnitId(1L)).thenReturn(List.of(a, b));
        Credential ownerFp = card(owner, null); ownerFp.setLocalTemplateId((short) 5);
        Credential memberFp = card(member, null); memberFp.setLocalTemplateId((short) 6);
        when(credentials.findByDevice_DeviceIdAndCredentialTypeAndStatus(2L, CredentialType.RFID, CredentialStatus.ACTIVE))
                .thenReturn(List.of(card(owner, "A1B2C3D4"), card(member, "11223344")));
        when(credentials.findByDevice_DeviceIdAndCredentialTypeAndStatus(2L, CredentialType.FINGERPRINT, CredentialStatus.ACTIVE))
                .thenReturn(List.of(ownerFp, memberFp));
        var snapshot = new LocalAccessPolicyService(devices, credentials, memberships, lockdown).snapshot("door");
        assertThat(snapshot.get("ownerRfid")).isEqualTo(List.of("A1B2C3D4"));
        assertThat(snapshot.get("ownerFingerprints")).isEqualTo(List.of(5));
        assertThat(snapshot.get("lockdown")).isEqualTo(true);
        assertThat((List<?>) snapshot.get("rfid")).hasSize(2);
        assertThat((List<?>) snapshot.get("fingerprints")).hasSize(2);
    }
    private Credential card(Account account, String uid) {
        Credential c = new Credential(); c.setAccount(account); c.setRfidUid(uid); return c;
    }
}
