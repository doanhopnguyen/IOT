package com.smartaccess.service;

import com.smartaccess.dto.manager.CreateMemberProfileRequest;
import com.smartaccess.exception.BusinessException;
import com.smartaccess.model.*;
import com.smartaccess.model.enumtype.*;
import com.smartaccess.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class MemberProfileServiceTest {
    @Mock AccountRepository accounts;
    @Mock AccessUnitRepository units;
    @Mock UserAccessRepository memberships;
    @Mock CredentialRepository credentials;
    @Mock AccessLogRepository accessLogs;
    @Mock AuditLogRepository audits;
    PasswordEncoder passwords = new BCryptPasswordEncoder(4);
    MemberProfileService service;
    Account manager;
    Account profile;
    AccessUnit unit;

    @BeforeEach
    void setup() {
        service = new MemberProfileService(accounts, units, memberships, credentials, accessLogs, audits, passwords);
        manager = new Account(); manager.setAccountId(1L); manager.setFullName("Manager");
        profile = new Account(); profile.setAccountId(2L); profile.setFullName("Bé Na"); profile.setPhone("0912000111");
        unit = new AccessUnit(); unit.setUnitId(10L); unit.setManager(manager);
    }

    AuditLog created(Long unitId, String room) {
        AuditLog audit = new AuditLog(); audit.setAction(MemberProfileService.CREATE_ACTION);
        audit.setEntityType("ACCOUNT"); audit.setEntityId(2L);
        Map<String, Object> details = new HashMap<>(); details.put("unitId", unitId.intValue()); details.put("room", room);
        audit.setDetails(details);
        return audit;
    }

    UserAccess membership(Long unitId) {
        AccessUnit other = new AccessUnit(); other.setUnitId(unitId);
        UserAccess access = new UserAccess(); access.setAccount(profile); access.setAccessUnit(other);
        return access;
    }

    void createdHere() {
        when(audits.findFirstByActionAndEntityTypeAndEntityIdOrderByAuditLogIdDesc(
                MemberProfileService.CREATE_ACTION, "ACCOUNT", 2L)).thenReturn(Optional.of(created(10L, null)));
    }

    @Test void createsMinimalAccountWithDefaultPasswordAndDevicePermissions() {
        when(accounts.saveAndFlush(any(Account.class))).thenAnswer(call -> {
            Account saved = call.getArgument(0); saved.setAccountId(2L); return saved;
        });
        UserAccess membership = service.create(unit, new CreateMemberProfileRequest("Bé Na", "0912000111", "P302"));
        Account account = membership.getAccount();
        assertThat(account.getPhone()).isEqualTo("0912000111"); assertThat(account.getEmail()).isNull();
        assertThat(passwords.matches("123456", account.getPasswordHash())).isTrue();
        assertThat(account.isAdmin()).isFalse(); assertThat(account.getStatus()).isEqualTo(AccountStatus.ACTIVE);
        assertThat(membership.isAllowFingerprint()).isTrue(); assertThat(membership.isAllowRfid()).isTrue();
        assertThat(membership.isAllowRemoteUnlock()).isFalse(); assertThat(membership.isAllowFace()).isFalse();
        verify(memberships).saveAndFlush(membership);
        var audit = ArgumentCaptor.forClass(AuditLog.class); verify(audits).save(audit.capture());
        assertThat(audit.getValue().getAction()).isEqualTo("CREATE_MEMBER_PROFILE");
        assertThat(audit.getValue().getEntityId()).isEqualTo(2L);
        assertThat(audit.getValue().getDetails()).containsEntry("unitId", 10L).containsEntry("room", "P302");
    }

    @Test void createsWithLowercasedEmailContact() {
        when(accounts.saveAndFlush(any(Account.class))).thenAnswer(call -> {
            Account saved = call.getArgument(0); saved.setAccountId(2L); return saved;
        });
        UserAccess membership = service.create(unit, new CreateMemberProfileRequest("Bé Na", "Na@Example.test", null));
        assertThat(membership.getAccount().getEmail()).isEqualTo("na@example.test");
        assertThat(membership.getAccount().getPhone()).isNull();
    }

    @Test void existingPhoneIs409() {
        when(accounts.existsByPhone("0912000111")).thenReturn(true);
        assertStatus(() -> service.create(unit, new CreateMemberProfileRequest("Bé Na", "0912000111", null)), HttpStatus.CONFLICT);
        verify(accounts, never()).saveAndFlush(any());
    }

    @Test void existingEmailIs409() {
        when(accounts.findByEmailIgnoreCase("na@example.test")).thenReturn(Optional.of(new Account()));
        assertStatus(() -> service.create(unit, new CreateMemberProfileRequest("Bé Na", "na@example.test", null)), HttpStatus.CONFLICT);
    }

    @ParameterizedTest @ValueSource(strings = {"", "123", "abc", "na@", "0912 000 111"})
    void invalidContactIs400(String contact) {
        assertStatus(() -> service.create(unit, new CreateMemberProfileRequest("Bé Na", contact, null)), HttpStatus.BAD_REQUEST);
        verifyNoInteractions(memberships, audits);
    }

    @Test void describesRoomLoginAndDeletableOnlyForThisUnit() {
        UserAccess member = membership(10L);
        when(audits.findByActionAndEntityTypeAndEntityIdIn(eq(MemberProfileService.CREATE_ACTION), eq("ACCOUNT"), anyCollection()))
                .thenReturn(List.of(created(10L, "P302")));
        var info = service.describe(10L, List.of(member)).get(2L);
        assertThat(info).isEqualTo(new MemberProfileService.ProfileInfo("P302", false, true));
        assertThat(service.describe(11L, List.of(member)).get(2L).deletableAccount()).isFalse();
    }

    @Test void loggedInProfileIsNotDeletable() {
        AuditLog login = new AuditLog(); login.setEntityId(2L);
        when(audits.findByActionAndEntityTypeAndEntityIdIn(eq(MemberProfileService.CREATE_ACTION), eq("ACCOUNT"), anyCollection()))
                .thenReturn(List.of(created(10L, null)));
        when(audits.findByActionAndEntityTypeAndEntityIdIn(eq(MemberProfileService.FIRST_LOGIN_ACTION), eq("ACCOUNT"), anyCollection()))
                .thenReturn(List.of(login));
        assertThat(service.describe(10L, List.of(membership(10L))).get(2L))
                .isEqualTo(new MemberProfileService.ProfileInfo(null, true, false));
    }

    @Test void recordsFirstLoginOnlyOnceForProfiles() {
        when(audits.existsByActionAndEntityTypeAndEntityId(MemberProfileService.CREATE_ACTION, "ACCOUNT", 2L)).thenReturn(true);
        service.recordLogin(profile);
        var audit = ArgumentCaptor.forClass(AuditLog.class); verify(audits).save(audit.capture());
        assertThat(audit.getValue().getAction()).isEqualTo("FIRST_LOGIN");

        reset(audits);
        when(audits.existsByActionAndEntityTypeAndEntityId(MemberProfileService.CREATE_ACTION, "ACCOUNT", 2L)).thenReturn(true);
        when(audits.existsByActionAndEntityTypeAndEntityId(MemberProfileService.FIRST_LOGIN_ACTION, "ACCOUNT", 2L)).thenReturn(true);
        service.recordLogin(profile);
        verify(audits, never()).save(any());
    }

    @Test void selfRegisteredLoginIsNotRecorded() {
        service.recordLogin(profile);
        verify(audits, never()).save(any());
    }

    @Test void profileCreatedHereAndNeverLoggedInIsDisposable() {
        createdHere(); when(memberships.findByAccountWithUnit(2L)).thenReturn(List.of(membership(10L)));
        assertThat(service.isDisposable(unit, 2L)).isTrue();
    }

    @Test void selfRegisteredAccountIsNotDisposable() {
        assertThat(service.isDisposable(unit, 2L)).isFalse();
    }

    @Test void profileOfAnotherUnitIsNotDisposable() {
        when(audits.findFirstByActionAndEntityTypeAndEntityIdOrderByAuditLogIdDesc(
                MemberProfileService.CREATE_ACTION, "ACCOUNT", 2L)).thenReturn(Optional.of(created(11L, null)));
        assertThat(service.isDisposable(unit, 2L)).isFalse();
    }

    @Test void loggedInProfileIsNotDisposable() {
        createdHere();
        when(audits.existsByActionAndEntityTypeAndEntityId(MemberProfileService.FIRST_LOGIN_ACTION, "ACCOUNT", 2L)).thenReturn(true);
        assertThat(service.isDisposable(unit, 2L)).isFalse();
    }

    @Test void profileInAnotherUnitIsNotDisposable() {
        createdHere(); when(memberships.findByAccountWithUnit(2L)).thenReturn(List.of(membership(10L), membership(11L)));
        assertThat(service.isDisposable(unit, 2L)).isFalse();
    }

    @Test void profileManagingAUnitIsNotDisposable() {
        createdHere(); when(units.existsByManager_AccountId(2L)).thenReturn(true);
        assertThat(service.isDisposable(unit, 2L)).isFalse();
    }

    @Test void activeFingerprintBlocksDisposal() {
        createdHere(); when(memberships.findByAccountWithUnit(2L)).thenReturn(List.of(membership(10L)));
        when(credentials.existsByAccount_AccountIdAndCredentialTypeAndStatus(2L, CredentialType.FINGERPRINT, CredentialStatus.ACTIVE))
                .thenReturn(true);
        assertStatus(() -> service.isDisposable(unit, 2L), HttpStatus.CONFLICT);
    }

    @Test void deletesAccountAndCredentialsWithoutAccessHistory() {
        Credential card = new Credential(); card.setCredentialType(CredentialType.RFID);
        when(credentials.findByAccount_AccountId(2L)).thenReturn(List.of(card));
        assertThat(service.dispose(profile)).isEqualTo(MemberProfileService.Disposal.DELETED);
        var order = inOrder(credentials, accounts);
        order.verify(credentials).deleteAll(List.of(card)); order.verify(credentials).flush();
        order.verify(accounts).delete(profile); order.verify(accounts).flush();
    }

    @Test void hidesAccountWithAccessHistory() {
        Credential card = new Credential(); card.setCredentialType(CredentialType.RFID);
        when(credentials.findByAccount_AccountId(2L)).thenReturn(List.of(card));
        when(accessLogs.existsByAccount_AccountId(2L)).thenReturn(true);
        assertThat(service.dispose(profile)).isEqualTo(MemberProfileService.Disposal.HIDDEN);
        assertThat(profile.getStatus()).isEqualTo(AccountStatus.DISABLED);
        assertThat(profile.getPhone()).isNull(); assertThat(profile.getEmail()).isEqualTo("deleted-2@noapp.local");
        assertThat(profile.getFullName()).isEqualTo("Bé Na");
        assertThat(card.getStatus()).isEqualTo(CredentialStatus.REVOKED); assertThat(card.getRevokedAt()).isNotNull();
        verify(accounts, never()).delete(any()); verify(credentials, never()).deleteAll(any());
    }

    void assertStatus(Runnable action, HttpStatus status) {
        assertThatThrownBy(action::run).isInstanceOfSatisfying(BusinessException.class,
                exception -> assertThat(exception.getStatus()).isEqualTo(status));
    }
}
