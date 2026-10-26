package com.smartaccess.service;

import com.smartaccess.dto.FaceDtos.*;
import com.smartaccess.model.*;
import com.smartaccess.model.enumtype.*;
import com.smartaccess.repository.*;
import org.junit.jupiter.api.*;
import org.mockito.ArgumentCaptor;
import org.springframework.web.server.ResponseStatusException;
import java.time.LocalDateTime;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class FaceEnrollmentServiceTest {
    CurrentAccountService current = mock(CurrentAccountService.class);
    AccountRepository accounts = mock(AccountRepository.class);
    AccessUnitRepository units = mock(AccessUnitRepository.class);
    UserAccessRepository memberships = mock(UserAccessRepository.class);
    FaceRequestRepository requests = mock(FaceRequestRepository.class);
    CredentialRepository credentials = mock(CredentialRepository.class);
    DeviceRepository devices = mock(DeviceRepository.class);
    DeviceAuthenticationService auth = mock(DeviceAuthenticationService.class);
    AuditLogRepository audits = mock(AuditLogRepository.class);
    FaceEnrollmentService service = new FaceEnrollmentService(current, accounts, units, memberships, requests,
            credentials, devices, auth, audits);
    Account owner, member;
    AccessUnit unit;
    Device camera;
    UserAccess membership;

    @BeforeEach void setup() {
        owner = account(1L); member = account(2L);
        unit = new AccessUnit(); unit.setUnitId(10L); unit.setUnitName("Door"); unit.setManager(owner);
        camera = new Device(); camera.setDeviceId(5L); camera.setDeviceUid("camera");
        camera.setDeviceType(DeviceType.FACE_CAMERA_NODE); camera.setAccessUnit(unit);
        membership = new UserAccess(); membership.setAccount(member); membership.setAccessUnit(unit);
        when(current.requireAccount()).thenReturn(member);
        when(units.findById(10L)).thenReturn(Optional.of(unit));
        when(accounts.findForUpdate(2L)).thenReturn(Optional.of(member));
        when(memberships.existsById(new UserAccessId(2L, 10L))).thenReturn(true);
        when(memberships.findById(new UserAccessId(2L, 10L))).thenReturn(Optional.of(membership));
        when(auth.authenticate("camera", "secret")).thenReturn(camera);
        when(requests.saveAndFlush(any())).thenAnswer(i -> {
            FaceRequest r = i.getArgument(0); r.setRequestId(8L); r.setRequestedAt(LocalDateTime.now()); return r;
        });
        when(credentials.saveAndFlush(any())).thenAnswer(i -> {
            Credential c = i.getArgument(0); c.setCredentialId(20L); return c;
        });
    }
    private Account account(Long id) {
        Account a = new Account(); a.setAccountId(id); a.setFullName("Account " + id); return a;
    }
    private List<Float> vector() {
        List<Float> v = new ArrayList<>(Collections.nCopies(512, 0f)); v.set(0, 1f); return v;
    }
    private CreateRequest input(boolean consent) { return new CreateRequest(10L, null, consent, FaceEmbedding.MODEL, vector()); }
    private Credential sample(CredentialStatus status) {
        Credential c = new Credential(); c.setCredentialId(20L); c.setAccount(member); c.setCredentialType(CredentialType.FACE);
        c.setStatus(status); c.setEmbeddingModel(FaceEmbedding.MODEL); c.setFaceEmbedding(FaceEmbedding.encode(FaceEmbedding.MODEL, vector()));
        return c;
    }
    private FaceRequest request(Credential pending) {
        FaceRequest r = new FaceRequest(); r.setRequestId(8L); r.setAccount(member); r.setAccessUnit(unit);
        when(requests.findAccountIdByRequestId(8L)).thenReturn(Optional.of(2L));
        when(requests.findForUpdate(8L)).thenReturn(Optional.of(r));
        AuditLog audit = new AuditLog(); audit.setDetails(Map.of("consent", true, "credentialId", 20L));
        when(audits.findFirstByActionAndEntityTypeAndEntityIdOrderByAuditLogIdDesc("REQUEST_FACE_ENROLLMENT", "FACE_REQUEST", 8L)).thenReturn(Optional.of(audit));
        when(credentials.findById(20L)).thenReturn(Optional.of(pending));
        return r;
    }
    @Test void consentAndAuthorizationAreRequiredBeforeStoringFeatures() {
        assertThatThrownBy(() -> service.create(input(false))).isInstanceOf(ResponseStatusException.class);
        Account stranger = account(3L); when(accounts.findForUpdate(3L)).thenReturn(Optional.of(stranger));
        assertThatThrownBy(() -> service.create(new CreateRequest(10L, 3L, true, FaceEmbedding.MODEL, vector())))
                .isInstanceOf(ResponseStatusException.class);
        verify(credentials, never()).saveAndFlush(any());
    }
    @Test void appVectorIsStoredPendingAndNotDistributedBeforeReview() {
        RequestView response = service.create(input(true));
        assertThat(response.status()).isEqualTo("PENDING");
        ArgumentCaptor<Credential> saved = ArgumentCaptor.forClass(Credential.class);
        verify(credentials).saveAndFlush(saved.capture());
        assertThat(saved.getValue().getStatus()).isEqualTo(CredentialStatus.PENDING);
        assertThat(saved.getValue().getFaceEmbedding()).hasSize(2048);
        when(credentials.findByAccount_AccountId(2L)).thenReturn(List.of(saved.getValue()));
        membership.setAllowFace(true); when(memberships.findMembersByUnitId(10L)).thenReturn(List.of(membership));
        assertThat(service.profile().hasTemplate()).isFalse();
        assertThat(service.templates("camera", "secret").templates()).isEmpty();
        ArgumentCaptor<AuditLog> audit = ArgumentCaptor.forClass(AuditLog.class); verify(audits).save(audit.capture());
        assertThat(audit.getValue().getDetails()).containsEntry("credentialId", 20L).containsEntry("consent", true);
    }
    @Test void malformedModelAndUnfinishedRequestsCannotReplaceTheActiveTemplate() {
        Credential old = sample(CredentialStatus.ACTIVE);
        when(credentials.findByAccount_AccountId(2L)).thenReturn(List.of(old));
        assertThatThrownBy(() -> service.create(new CreateRequest(10L, null, true, "different-model", vector())))
                .isInstanceOf(ResponseStatusException.class);
        FaceRequest pending = request(sample(CredentialStatus.PENDING));
        when(requests.findByAccount_AccountIdAndStatusIn(eq(2L), any())).thenReturn(List.of(pending));
        assertThatThrownBy(() -> service.create(input(true))).isInstanceOf(ResponseStatusException.class);
        assertThat(old.getStatus()).isEqualTo(CredentialStatus.ACTIVE);
        verify(credentials, never()).saveAndFlush(any());
    }
    @Test void approvalActivatesTheAppSampleAndAtomicallyReplacesThePreviousTemplate() {
        Credential pending = sample(CredentialStatus.PENDING), old = sample(CredentialStatus.ACTIVE); old.setCredentialId(9L);
        FaceRequest r = request(pending);
        when(credentials.findByAccount_AccountId(2L)).thenReturn(List.of(old, pending));
        assertThatThrownBy(() -> service.decide(8L, true)).isInstanceOf(ResponseStatusException.class);
        assertThat(old.getStatus()).isEqualTo(CredentialStatus.ACTIVE);
        when(current.requireAccount()).thenReturn(owner);
        service.decide(8L, true);
        assertThat(pending.getStatus()).isEqualTo(CredentialStatus.ACTIVE);
        assertThat(old.getStatus()).isEqualTo(CredentialStatus.REVOKED);
        assertThat(r.getStatus()).isEqualTo(FaceRequestStatus.COMPLETED);
        assertThat(r.getCompletedAt()).isNotNull(); assertThat(membership.isAllowFace()).isTrue();
        assertThatThrownBy(() -> service.decide(8L, true)).isInstanceOf(ResponseStatusException.class);
    }
    @Test void rejectionAndCancellationDiscardOnlyThePendingSample() {
        Credential pending = sample(CredentialStatus.PENDING), old = sample(CredentialStatus.ACTIVE);
        FaceRequest r = request(pending); when(current.requireAccount()).thenReturn(owner);
        service.decide(8L, false);
        assertThat(pending.getStatus()).isEqualTo(CredentialStatus.REVOKED);
        assertThat(old.getStatus()).isEqualTo(CredentialStatus.ACTIVE);
        assertThat(r.getStatus()).isEqualTo(FaceRequestStatus.REJECTED);
        pending.setStatus(CredentialStatus.PENDING); r.setStatus(FaceRequestStatus.PENDING);
        when(current.requireAccount()).thenReturn(member); service.cancel(8L);
        assertThat(pending.getStatus()).isEqualTo(CredentialStatus.REVOKED);
    }
    @Test void legacyRequestsWithoutAnAppSampleCannotBeApproved() {
        Credential pending = sample(CredentialStatus.PENDING); FaceRequest r = request(pending);
        when(audits.findFirstByActionAndEntityTypeAndEntityIdOrderByAuditLogIdDesc("REQUEST_FACE_ENROLLMENT", "FACE_REQUEST", 8L)).thenReturn(Optional.empty());
        when(current.requireAccount()).thenReturn(owner);
        assertThatThrownBy(() -> service.decide(8L, true)).isInstanceOf(ResponseStatusException.class);
        assertThat(r.getStatus()).isEqualTo(FaceRequestStatus.PENDING);
    }
    @Test void managerCannotReplaceAnotherAccountsGlobalActiveTemplate() {
        when(current.requireAccount()).thenReturn(owner);
        when(credentials.findByAccount_AccountId(2L)).thenReturn(List.of(sample(CredentialStatus.ACTIVE)));
        assertThatThrownBy(() -> service.create(new CreateRequest(10L, 2L, true, FaceEmbedding.MODEL, vector())))
                .isInstanceOf(ResponseStatusException.class);
        verify(credentials, never()).saveAndFlush(any());
    }
    @Test void oneApprovedTemplateIsDistributedOnlyToAuthorizedDoors() {
        Credential active = sample(CredentialStatus.ACTIVE);
        when(credentials.findByAccount_AccountId(2L)).thenReturn(List.of(active));
        membership.setAllowFace(true); when(memberships.findMembersByUnitId(10L)).thenReturn(List.of(membership));
        assertThat(service.templates("camera", "secret").templates()).extracting(Template::credentialId).containsExactly(20L);
        unit.setUnitId(11L); when(memberships.findMembersByUnitId(11L)).thenReturn(List.of(membership));
        assertThat(service.templates("camera", "secret").templates()).extracting(Template::credentialId).containsExactly(20L);
        membership.setAllowFace(false); assertThat(service.templates("camera", "secret").templates()).isEmpty();
    }
    @Test void globalRevocationCancelsPendingSamplesAndRequests() {
        Credential pending = sample(CredentialStatus.PENDING), old = sample(CredentialStatus.ACTIVE);
        FaceRequest r = request(pending);
        when(credentials.findByAccount_AccountId(2L)).thenReturn(List.of(old, pending));
        when(requests.findByAccount_AccountIdAndStatusIn(eq(2L), any())).thenReturn(List.of(r));
        service.revoke();
        assertThat(old.getStatus()).isEqualTo(CredentialStatus.REVOKED);
        assertThat(pending.getStatus()).isEqualTo(CredentialStatus.REVOKED);
        assertThat(r.getStatus()).isEqualTo(FaceRequestStatus.REJECTED);
    }
}
