package com.smartaccess.service;

import com.smartaccess.dto.manager.AddFingerprintRequest;
import com.smartaccess.model.*;
import com.smartaccess.model.enumtype.*;
import com.smartaccess.repository.*;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.context.ApplicationEventPublisher;
import java.time.LocalDateTime;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@DataJpaTest(showSql=false,properties={"spring.datasource.url=jdbc:h2:mem:enrollment;MODE=MySQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver","spring.datasource.username=sa","spring.datasource.password=",
        "spring.flyway.enabled=false","spring.jpa.hibernate.ddl-auto=create-drop"})
@AutoConfigureTestDatabase(replace=AutoConfigureTestDatabase.Replace.NONE)
class EnrollmentRegressionTest {
    @Autowired EntityManager em;
    @Autowired CommandRepository commands;
    @Autowired AccountRepository accounts;
    @Autowired DeviceRepository devices;
    @Autowired AccessUnitRepository units;
    @Autowired CredentialRepository credentials;
    @Autowired AccessLogRepository logs;
    @Autowired AuditLogRepository audits;
    @Autowired EventRepository events;
    @Autowired DeviceInventoryRepository inventory;
    final ManagerAccessGuard guard=mock(ManagerAccessGuard.class);
    final MemberRemovalService removals=mock(MemberRemovalService.class);
    EnrollmentService enrollments;
    FingerprintService fingerprints;
    RfidScanService scans;
    RfidService rfids;
    CommandAckService acks;
    Device device;
    Account owner,member;
    AccessUnit unit;

    @BeforeEach void setup() {
        owner=account();member=account(); unit=new AccessUnit(); unit.setManager(owner);unit.setUnitName("Door"); em.persist(unit);
        device=new Device();device.setDeviceUid(UUID.randomUUID().toString());device.setDeviceName("Controller");
        device.setDeviceType(DeviceType.DOOR_CONTROLLER);device.setLifecycleStatus(DeviceLifecycleStatus.ACTIVE);
        device.setAccessUnit(unit);device.setLastSeenAt(LocalDateTime.now());em.persist(device);em.flush();
        when(guard.requireManagedUnit(owner.getAccountId(),unit.getUnitId())).thenReturn(unit);
        when(guard.requireOnlineController(unit.getUnitId())).thenReturn(device);
        var dispatcher=new DeviceCommandService(commands,accounts,mock(ApplicationEventPublisher.class),mock(DeviceGateway.class),logs);
        enrollments=new EnrollmentService(guard,devices,commands,dispatcher);
        fingerprints=new FingerprintService(guard,dispatcher,commands,credentials,devices,removals);
        scans=new RfidScanService(guard,devices,dispatcher,commands,removals);
        rfids=new RfidService(guard,accounts,devices,credentials,removals);
        org.springframework.test.util.ReflectionTestUtils.setField(rfids,"commands",commands);
        acks=new CommandAckService(commands,units,accounts,credentials,logs,audits,devices,events,inventory);
    }
    Account account() {
        Account a=new Account();a.setFullName("Owner");a.setEmail(UUID.randomUUID()+"@test.invalid");a.setPasswordHash("test-hash");em.persist(a);return a;
    }
    Command fingerprint() {
        var response=fingerprints.startEnroll(owner.getAccountId(),unit.getUnitId(),member.getAccountId(),new AddFingerprintRequest("Finger"));
        return commands.findByCommandUuid(response.commandUuid()).orElseThrow();
    }
    Command scan() {
        var response=scans.start(owner.getAccountId(),unit.getUnitId(),member.getAccountId());
        return commands.findByCommandUuid(response.commandUuid()).orElseThrow();
    }
    void ack(Command command,boolean success,String message) { acks.handleAck(device.getDeviceUid(),command.getCommandUuid(),success,message,1); }
    void cancelAck(String uuid,String message) { acks.handleAck(device.getDeviceUid(),uuid,true,message); }

    @Test void confirmedCancelBlocksLateFingerprintAckAndAllowsImmediateReenrollmentWithoutDeletingOldCredentials() {
        Credential old=new Credential();old.setAccount(member);old.setDevice(device);old.setCredentialType(CredentialType.FINGERPRINT);old.setLocalTemplateId((short)9);em.persist(old);
        var original=fingerprint();
        var cancellation=enrollments.cancel(owner.getAccountId(),unit.getUnitId(),original.getCommandUuid());
        assertThat(enrollments.cancel(owner.getAccountId(),unit.getUnitId(),original.getCommandUuid()).commandUuid()).isEqualTo(cancellation.commandUuid());
        assertThatThrownBy(this::fingerprint).isInstanceOf(RuntimeException.class);
        cancelAck(cancellation.commandUuid(),EnrollmentService.CANCELLED);
        ack(original,true,"ENROLLED"); // Late success must not create a credential.
        assertThat(original.getStatus()).isEqualTo(CommandStatus.FAILED);
        assertThat(original.getResultMessage()).isEqualTo(EnrollmentService.CANCELLED);
        assertThat(com.smartaccess.dto.manager.CommandResponse.from(original).acknowledgedAt()).isNotNull();
        assertThat(credentials.findAll()).extracting(Credential::getCredentialId).containsExactly(old.getCredentialId());
        assertThat(old.getStatus()).isEqualTo(CredentialStatus.ACTIVE);
        assertThat(fingerprint().getCommandUuid()).isNotEqualTo(original.getCommandUuid());
    }
    @Test void completionBeforeCancelIsReportedSeparatelyAndStoredTemplateIsPreserved() {
        var original=fingerprint(); ack(original,true,"ENROLLED");
        var result=enrollments.cancel(owner.getAccountId(),unit.getUnitId(),original.getCommandUuid());
        assertThat(result.resultMessage()).isEqualTo(EnrollmentService.COMPLETED);
        assertThat(credentials.findAll()).hasSize(1);
        assertThat(commands.findAll()).hasSize(1);
    }
    @Test void completionRacingWithCancelKeepsTheCompletedFingerprintAndWaitsForItsAck() {
        var original=fingerprint();
        var cancellation=enrollments.cancel(owner.getAccountId(),unit.getUnitId(),original.getCommandUuid());
        cancelAck(cancellation.commandUuid(),EnrollmentService.COMPLETED);
        ack(original,true,"ENROLLED");
        assertThat(original.getStatus()).isEqualTo(CommandStatus.ACKNOWLEDGED);
        assertThat(credentials.findAll()).hasSize(1);
    }
    @Test void anUnconfirmedOrUnsupportedCancelNeverMarksOriginalAsCancelledAndCanBeRetried() {
        var original=fingerprint();
        var first=enrollments.cancel(owner.getAccountId(),unit.getUnitId(),original.getCommandUuid());
        acks.handleAck(device.getDeviceUid(),first.commandUuid(),false,"UNSUPPORTED_COMMAND");
        assertThat(original.getStatus()).isEqualTo(CommandStatus.PENDING);
        var retry=enrollments.cancel(owner.getAccountId(),unit.getUnitId(),original.getCommandUuid());
        assertThat(retry.commandUuid()).isNotEqualTo(first.commandUuid());
        commands.findByCommandUuid(retry.commandUuid()).orElseThrow().setStatus(CommandStatus.TIMEOUT);
        assertThat(original.getStatus()).isEqualTo(CommandStatus.PENDING);
        cancelAck(retry.commandUuid(),EnrollmentService.CANCELLED); // A late authoritative ACK can confirm cancellation.
        assertThat(original.getResultMessage()).isEqualTo(EnrollmentService.CANCELLED);
    }
    @Test void lateRfidResultsAndAssignmentsAreRejectedAfterCancellationRequestOrConfirmation() {
        var original=scan();ack(original,true,"RFID_UID:A1B2C3D4");
        var cancellation=enrollments.cancel(owner.getAccountId(),unit.getUnitId(),original.getCommandUuid());
        assertThatThrownBy(() -> rfids.assignScanned(owner.getAccountId(),unit.getUnitId(),member.getAccountId(),"A1B2C3D4",original.getCommandUuid())).isInstanceOf(RuntimeException.class);
        cancelAck(cancellation.commandUuid(),EnrollmentService.CANCELLED);
        ack(original,true,"RFID_UID:A1B2C3D4");
        assertThat(original.getStatus()).isEqualTo(CommandStatus.FAILED);
        assertThat(credentials.findAll()).isEmpty();
        assertThat(scan().getCommandUuid()).isNotEqualTo(original.getCommandUuid());
    }
    @Test void fingerprintAndRfidSessionsMutuallyExcludeEachOther() {
        var first=scan(); assertThatThrownBy(this::fingerprint).isInstanceOf(RuntimeException.class);
        ack(first,false,"RFID_SCAN_TIMEOUT");
        fingerprint(); assertThatThrownBy(this::scan).isInstanceOf(RuntimeException.class);
    }
    @Test void anotherOwnerOrUnitCannotCancelTheSessionAndSpoofedDeviceAcksDoNotApply() {
        var original=fingerprint();
        assertThatThrownBy(() -> enrollments.cancel(member.getAccountId(),unit.getUnitId(),original.getCommandUuid())).isInstanceOf(RuntimeException.class);
        assertThatThrownBy(() -> enrollments.cancel(owner.getAccountId(),unit.getUnitId()+100,original.getCommandUuid())).isInstanceOf(RuntimeException.class);
        var cancellation=enrollments.cancel(owner.getAccountId(),unit.getUnitId(),original.getCommandUuid());
        acks.handleAck("other-device",cancellation.commandUuid(),true,EnrollmentService.CANCELLED);
        assertThat(original.getStatus()).isEqualTo(CommandStatus.PENDING);
        cancelAck(cancellation.commandUuid(),"OK");
        assertThat(commands.findByCommandUuid(cancellation.commandUuid()).orElseThrow().getStatus()).isEqualTo(CommandStatus.FAILED);
    }
    @Test void suspensionCanAcknowledgeOnlyEnrollmentCleanupAndNeverRemoteControl() {
        var original=fingerprint();
        var cancellation=enrollments.cancel(owner.getAccountId(),unit.getUnitId(),original.getCommandUuid());
        assertThat(acks.handleEnrollmentCleanupAck(device.getDeviceUid(),original.getCommandUuid(),true,"ENROLLED")).isFalse();
        assertThat(credentials.findAll()).isEmpty();
        assertThat(acks.handleEnrollmentCleanupAck(device.getDeviceUid(),cancellation.commandUuid(),true,EnrollmentService.CANCELLED)).isTrue();
        assertThat(original.getResultMessage()).isEqualTo(EnrollmentService.CANCELLED);
    }
}
