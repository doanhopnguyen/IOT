package com.smartaccess;

import com.smartaccess.dto.manager.AddFingerprintRequest;
import com.smartaccess.dto.manager.ChangePinRequest;
import com.smartaccess.dto.manager.CommandResponse;
import com.smartaccess.exception.BusinessException;
import com.smartaccess.model.*;
import com.smartaccess.model.enumtype.*;
import com.smartaccess.repository.*;
import com.smartaccess.scheduler.CommandTimeoutScheduler;
import com.smartaccess.service.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.*;

/** Scratch check of the guide's code on H2; not transactional so AFTER_COMMIT really fires. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE, properties = {
        "spring.datasource.url=jdbc:h2:mem:flow;MODE=MySQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa", "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.flyway.enabled=false", "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.task.scheduling.pool.size=1"})
class DeviceCommandFlowTest {

    record Sent(String deviceUid, String commandUuid, String type, Map<String, Object> data) {}

    @TestConfiguration
    static class Config {
        @Bean
        @Primary
        RecordingGateway recordingGateway() { return new RecordingGateway(); }
    }

    static class RecordingGateway implements DeviceGateway {
        final List<Sent> sent = new ArrayList<>();
        boolean fail;

        @Override
        public void send(String deviceUid, String commandUuid, String commandType, Map<String, Object> data) {
            if (fail) { throw new IllegalStateException("broker down"); }
            sent.add(new Sent(deviceUid, commandUuid, commandType, data));
        }
    }

    @Autowired RecordingGateway gateway;
    @Autowired PinService pinService;
    @Autowired OnboardingService onboardingService;
    @Autowired PinAlertResponseService pinResponses;
    @Autowired EventRepository events;
    @Autowired LockdownService lockdownService;
    @Autowired FingerprintService fingerprintService;
    @Autowired RemoteUnlockService unlockService;
    @Autowired CommandAckService ackService;
    @Autowired DeviceCommandService commandService;
    @Autowired CommandTimeoutScheduler scheduler;
    @Autowired AccountRepository accounts;
    @Autowired AccessUnitRepository units;
    @Autowired DeviceRepository devices;
    @Autowired UserAccessRepository memberships;
    @Autowired CredentialRepository credentials;
    @Autowired CommandRepository commands;
    @Autowired AccessLogRepository accessLogs;
    @Autowired AuditLogRepository audits;
    @Autowired AccessEventService localEvents;
    @Autowired PasswordEncoder encoder;
    @Autowired TransactionTemplate tx;
    @Autowired JdbcTemplate jdbc;

    Long managerId, otherManagerId, userId, unitId;
    String uid;
    static int seq;

    @BeforeEach
    void seed() {
        gateway.sent.clear();
        gateway.fail = false;
        int n = ++seq;
        tx.executeWithoutResult(s -> {
            Account manager = account("m" + n);
            Account other = account("o" + n);
            Account user = account("u" + n);
            AccessUnit unit = new AccessUnit();
            unit.setManager(manager);
            unit.setUnitName("Door " + n);
            units.save(unit);
            Device device = new Device();
            device.setAccessUnit(unit);
            device.setDeviceUid("DEV-" + n);
            device.setDeviceName("ctl");
            device.setDeviceType(DeviceType.DOOR_CONTROLLER);
            device.setLifecycleStatus(DeviceLifecycleStatus.ACTIVE);
            device.setLastSeenAt(LocalDateTime.now());
            devices.save(device);
            UserAccess ua = new UserAccess();
            ua.setAccount(user);
            ua.setAccessUnit(unit);
            memberships.save(ua);
            managerId = manager.getAccountId();
            otherManagerId = other.getAccountId();
            userId = user.getAccountId();
            unitId = unit.getUnitId();
            uid = device.getDeviceUid();
        });
    }

    Account account(String name) {
        Account a = new Account();
        a.setFullName(name);
        a.setEmail(name + "@example.test");
        a.setPasswordHash("x");
        return accounts.save(a);
    }

    CommandStatus status(String uuid) { return commands.findByCommandUuid(uuid).orElseThrow().getStatus(); }
    Long pinAlert(){
        return tx.execute(s->{
            Event alert=new Event();alert.setEventUuid(java.util.UUID.randomUUID().toString());
            alert.setDevice(devices.findByDeviceUid(uid).orElseThrow());alert.setEventType(AlertRuleService.REPEATED_WRONG_PIN);
            alert.setSeverity(EventSeverity.CRITICAL);alert.setAlertStatus(AlertStatus.OPEN);alert.setOccurredAt(LocalDateTime.now());
            return events.saveAndFlush(alert).getEventId();
        });
    }
    void ownerSession(){
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(
            org.springframework.security.authentication.UsernamePasswordAuthenticationToken.authenticated(
                new com.smartaccess.security.AccountPrincipal(managerId),null,java.util.List.of()));
    }
    @org.junit.jupiter.api.AfterEach void clearSession(){org.springframework.security.core.context.SecurityContextHolder.clearContext();}
    @Test void pinSafeWaitsForCorrectDeviceAckAndResolvesOnlyAfterApplied(){
        Long id=pinAlert();ownerSession();var response=pinResponses.respond(id,PinAlertResponseService.Action.SAFE);
        assertThat(events.findById(id).orElseThrow().getAlertStatus()).isEqualTo(AlertStatus.OPEN);
        assertThat(gateway.sent.get(0).data()).containsKey("pinResponseSeq");
        ackService.handleAck("FOREIGN",response.commandUuid(),true,"PIN_ALERT_SAFE_APPLIED");
        assertThat(events.findById(id).orElseThrow().getAlertStatus()).isEqualTo(AlertStatus.OPEN);
        ackService.handleAck(uid,response.commandUuid(),true,"PIN_ALERT_SAFE_APPLIED");
        assertThat(status(response.commandUuid())).isEqualTo(CommandStatus.ACKNOWLEDGED);
        assertThat(events.findById(id).orElseThrow().getAlertStatus()).isEqualTo(AlertStatus.RESOLVED);
        assertThat(events.latestPinResponseAt(devices.findByDeviceUid(uid).orElseThrow().getDeviceId())).isPresent();
        assertThat(lockdownService.isLockedDown(unitId)).isFalse();
    }
    @Test void pinLockdownParticipatesInNormalLockdownAndReleaseFlow(){
        Long id=pinAlert();ownerSession();var response=pinResponses.respond(id,PinAlertResponseService.Action.LOCKDOWN);
        assertThat(lockdownService.isLockedDown(unitId)).isTrue();
        ackService.handleAck(uid,response.commandUuid(),true,"PIN_ALERT_LOCKDOWN_APPLIED");
        assertThat(events.findById(id).orElseThrow().getAlertStatus()).isEqualTo(AlertStatus.RESOLVED);
        assertThat(lockdownService.isLockedDown(unitId)).isTrue();
        var release=lockdownService.release(managerId,unitId);
        ackService.handleAck(uid,release.commandUuid(),true,"LOCKDOWN_OFF");
        assertThat(lockdownService.isLockedDown(unitId)).isFalse();
    }
    @Test void pinResponseFailureOrWrongAcknowledgementDoesNotResolve(){
        Long id=pinAlert();ownerSession();var failed=pinResponses.respond(id,PinAlertResponseService.Action.SAFE);
        ackService.handleAck(uid,failed.commandUuid(),false,"STORAGE_ERROR");
        assertThat(status(failed.commandUuid())).isEqualTo(CommandStatus.FAILED);
        assertThat(events.findById(id).orElseThrow().getAlertStatus()).isEqualTo(AlertStatus.OPEN);
        var wrong=pinResponses.respond(id,PinAlertResponseService.Action.SAFE);
        ackService.handleAck(uid,wrong.commandUuid(),true,"OK");
        assertThat(status(wrong.commandUuid())).isEqualTo(CommandStatus.FAILED);
        assertThat(events.findById(id).orElseThrow().getAlertStatus()).isEqualTo(AlertStatus.OPEN);
    }

    @Test void servoPreviewSaveAndStopHaveOrderedSequencesAndWaitForAuthenticatedAcks() {
        var preview=onboardingService.previewServo(managerId,unitId,"OPEN",-15);
        var save=onboardingService.setServoAngles(managerId,unitId,0,-15);
        var stop=onboardingService.stopServoPreview(managerId,unitId);
        long previous=0;
        for(Sent sent:gateway.sent){
            var command=commands.findByCommandUuid(sent.commandUuid()).orElseThrow();
            assertThat(sent.data().get("servoSeq")).isEqualTo(command.getCommandId());
            assertThat(command.getCommandId()).isGreaterThan(previous);previous=command.getCommandId();
            assertThat(command.getStatus()).isEqualTo(CommandStatus.SENT);
            ackService.handleAck(uid,sent.commandUuid(),true,"SERVO_OK");
            assertThat(status(sent.commandUuid())).isEqualTo(CommandStatus.ACKNOWLEDGED);
        }
        assertThat(gateway.sent).extracting(Sent::commandUuid).containsExactly(preview.commandUuid(),save.commandUuid(),stop.commandUuid());
        assertThat(gateway.sent.get(0).data()).containsEntry("angle",-15).containsEntry("openDirection",-1).doesNotContainKeys("lockAngle","openAngle");
        assertThat(gateway.sent.get(1).data()).containsEntry("lockAngle",0).containsEntry("openAngle",-15).containsEntry("openDirection",-1);
        assertThat(gateway.sent.get(2).data()).doesNotContainKeys("angle","target");
    }

    @Test
    void offlineLocalEventsAreIdempotentAndPreserveDeviceTime() throws Exception {
        var json = new com.fasterxml.jackson.databind.ObjectMapper();
        long before = accessLogs.count();
        String eventUuid = java.util.UUID.randomUUID().toString();
        var event = json.readTree("{\"eventUuid\":\"" + eventUuid
                + "\",\"method\":\"PIN\",\"result\":\"GRANTED\",\"occurredAt\":1700000000}");
        localEvents.recordLocal(uid, event); localEvents.recordLocal(uid, event);
        assertThat(accessLogs.count()).isEqualTo(before + 1);
        var saved = accessLogs.findByAccessUuid(eventUuid).orElseThrow();
        assertThat(saved.getOccurredAt()).isEqualTo(LocalDateTime.ofInstant(
                java.time.Instant.ofEpochSecond(1700000000), java.time.ZoneId.of("Asia/Ho_Chi_Minh")));
        assertThat(saved.getMethod()).isEqualTo(AccessMethod.PIN);
        assertThat(saved.getResult()).isEqualTo(AccessResult.GRANTED);
        assertThatThrownBy(() -> localEvents.recordLocal(uid, json.readTree(
                "{\"eventUuid\":\"invalid\",\"method\":\"RFID\",\"result\":\"GRANTED\"}")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(accessLogs.count()).isEqualTo(before + 1);
    }

    @Test
    void memberRemoteUnlockRequiresItsOwnExplicitPermission() {
        assertThatThrownBy(() -> unlockService.unlock(userId, unitId))
                .isInstanceOfSatisfying(BusinessException.class, ex -> assertThat(ex.getStatus()).isEqualTo(HttpStatus.FORBIDDEN));
        tx.executeWithoutResult(s -> memberships.findById(new UserAccessId(userId, unitId)).orElseThrow().setAllowRemoteUnlock(true));
        var command = unlockService.unlock(userId, unitId);
        assertThat(status(command.commandUuid())).isEqualTo(CommandStatus.SENT);
        tx.executeWithoutResult(s -> memberships.findById(new UserAccessId(userId, unitId)).orElseThrow().setAllowRemoteUnlock(false));
        assertThatThrownBy(() -> unlockService.unlock(userId, unitId)).isInstanceOf(BusinessException.class);
    }

    @Test
    void pinChangesOnlyAfterAck() {
        CommandResponse r = pinService.changePin(managerId, unitId, new ChangePinRequest("123456", "123456"));
        assertThat(r.status()).isEqualTo(CommandStatus.PENDING);
        assertThat(status(r.commandUuid())).isEqualTo(CommandStatus.SENT);
        assertThat(gateway.sent).hasSize(1);
        assertThat(gateway.sent.get(0).data()).containsEntry("pin", "123456");
        assertThat(units.findById(unitId).orElseThrow().getAccessPinHash()).isNull();
        String raw = jdbc.queryForObject("select cast(payload as varchar) from commands where command_uuid = ?",
                String.class, r.commandUuid());
        assertThat(raw).doesNotContain("123456");

        ackService.handleAck(uid, r.commandUuid(), true, "OK");

        AccessUnit unit = units.findById(unitId).orElseThrow();
        assertThat(encoder.matches("123456", unit.getAccessPinHash())).isTrue();
        assertThat(unit.isPinEnabled()).isTrue();
        Command c = commands.findByCommandUuid(r.commandUuid()).orElseThrow();
        assertThat(c.getStatus()).isEqualTo(CommandStatus.ACKNOWLEDGED);
        assertThat(c.getPayload()).doesNotContainKey("pinHash");
        assertThat(commandService.getOwnCommand(managerId, r.commandUuid()).status())
                .isEqualTo(CommandStatus.ACKNOWLEDGED);
        assertThatThrownBy(() -> commandService.getOwnCommand(otherManagerId, r.commandUuid()))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void pinValidationAndFailedAckKeepOldPin() {
        assertThatThrownBy(() -> pinService.changePin(managerId, unitId, new ChangePinRequest("12ab", "12ab")))
                .hasMessage("Mã PIN không hợp lệ");
        assertThatThrownBy(() -> pinService.changePin(managerId, unitId, new ChangePinRequest("123456", "654321")))
                .hasMessage("Mã PIN nhập lại không khớp");
        long before = commands.count();
        CommandResponse r = pinService.changePin(managerId, unitId, new ChangePinRequest("111111", "111111"));
        assertThat(commands.count()).isEqualTo(before + 1);
        ackService.handleAck(uid, r.commandUuid(), false, "STORAGE_ERROR");
        assertThat(status(r.commandUuid())).isEqualTo(CommandStatus.FAILED);
        assertThat(units.findById(unitId).orElseThrow().getAccessPinHash()).isNull();
    }

    @Test
    void fingerprintEnrollUsesSlotReportedByFirmwareAndRejectsConflicts() {
        // Ô 1 trong cảm biến còn mẫu cũ: firmware tự lưu sang ô 5 và báo templateId=5.
        CommandResponse e1 = fingerprintService.startEnroll(managerId, unitId, userId, new AddFingerprintRequest("Ngón trỏ"));
        assertThat(gateway.sent.get(0).data()).containsEntry("templateId", 1).containsEntry("usedSlots", List.of());
        ackService.handleAck(uid, e1.commandUuid(), true, "ENROLLED", 5);
        assertThat(status(e1.commandUuid())).isEqualTo(CommandStatus.ACKNOWLEDGED);
        assertThat(credentials.findAll()).singleElement()
                .satisfies(c -> assertThat(c.getLocalTemplateId()).isEqualTo((short) 5));

        // Lần sau backend báo ô 5 đang dùng; firmware báo trùng ô 5 → không tạo credential thứ hai.
        CommandResponse e2 = fingerprintService.startEnroll(managerId, unitId, userId, new AddFingerprintRequest("Ngón cái"));
        assertThat(gateway.sent.get(1).data()).containsEntry("usedSlots", List.of(5));
        ackService.handleAck(uid, e2.commandUuid(), true, "ENROLLED", 5);
        assertThat(status(e2.commandUuid())).isEqualTo(CommandStatus.FAILED);
        assertThat(credentials.count()).isEqualTo(1);
        credentials.deleteAll(); // Các test khác dùng chung DB và bắt đầu từ 0 vân tay.
    }

    @Test
    void fingerprintEnrollDeleteAndSlotReuse() {
        CommandResponse e1 = fingerprintService.startEnroll(managerId, unitId, userId, new AddFingerprintRequest(" Ngón trỏ phải "));
        assertThat(gateway.sent.get(0).data()).containsEntry("templateId", 1);
        assertThatThrownBy(() -> fingerprintService.startEnroll(managerId, unitId, userId, new AddFingerprintRequest("x")))
                .isInstanceOfSatisfying(BusinessException.class, ex -> assertThat(ex.getStatus()).isEqualTo(HttpStatus.CONFLICT));
        assertThat(credentials.count()).isZero();

        ackService.handleAck("DEV-OTHER", e1.commandUuid(), true, "OK");
        assertThat(status(e1.commandUuid())).isEqualTo(CommandStatus.SENT);
        ackService.handleAck(uid, e1.commandUuid(), true, "OK");
        ackService.handleAck(uid, e1.commandUuid(), true, "OK");
        List<Credential> all = credentials.findAll();
        assertThat(all).hasSize(1);
        Credential c1 = all.get(0);
        assertThat(audits.findAll()).anyMatch(a -> "FP_ENROLL".equals(a.getAction())
                && c1.getCredentialId().equals(a.getEntityId())
                && "Ngón trỏ phải".equals(a.getDetails().get("label")));
        assertThat(c1.getLocalTemplateId()).isEqualTo((short) 1);
        assertThat(c1.getStatus()).isEqualTo(CredentialStatus.ACTIVE);

        CommandResponse e2 = fingerprintService.startEnroll(managerId, unitId, userId, new AddFingerprintRequest("Ngón cái"));
        assertThat(gateway.sent.get(1).data()).containsEntry("templateId", 2);
        ackService.handleAck(uid, e2.commandUuid(), false, "SCAN_TIMEOUT");
        assertThat(credentials.count()).isEqualTo(1);

        assertThatThrownBy(() -> fingerprintService.startDelete(otherManagerId, unitId, userId, c1.getCredentialId()))
                .isInstanceOfSatisfying(BusinessException.class, ex -> assertThat(ex.getStatus()).isEqualTo(HttpStatus.FORBIDDEN));
        assertThatThrownBy(() -> fingerprintService.startDelete(managerId, unitId, managerId, c1.getCredentialId()))
                .isInstanceOfSatisfying(BusinessException.class, ex -> assertThat(ex.getStatus()).isEqualTo(HttpStatus.NOT_FOUND));

        CommandResponse d = fingerprintService.startDelete(managerId, unitId, userId, c1.getCredentialId());
        assertThat(gateway.sent.get(2).type()).isEqualTo("FP_DELETE");
        assertThat(gateway.sent.get(2).data()).containsEntry("templateId", 1);
        assertThat(credentials.findById(c1.getCredentialId()).orElseThrow().getStatus()).isEqualTo(CredentialStatus.ACTIVE);
        ackService.handleAck(uid, d.commandUuid(), true, "OK");
        Credential revoked = credentials.findById(c1.getCredentialId()).orElseThrow();
        assertThat(revoked.getStatus()).isEqualTo(CredentialStatus.REVOKED);
        assertThat(revoked.getRevokedAt()).isNotNull();

        fingerprintService.startEnroll(managerId, unitId, userId, new AddFingerprintRequest("Lại"));
        assertThat(gateway.sent.get(3).data()).containsEntry("templateId", 1);
        credentials.deleteAll();
    }

    @Test
    void unlockWritesAccessLogOnAck() {
        CommandResponse r = unlockService.unlock(managerId, unitId);
        assertThat(gateway.sent.get(0).data()).containsEntry("durationSec", 5).containsKeys("issuedAt", "ttlSec");
        long logsBefore = accessLogs.count();
        ackService.handleAck(uid, r.commandUuid(), true, "OK");
        ackService.handleAck(uid, r.commandUuid(), true, "OK");
        assertThat(accessLogs.count()).isEqualTo(logsBefore + 1);
        tx.executeWithoutResult(s -> {
            AccessLog log = accessLogs.findAll().stream()
                    .filter(l -> l.getAccessUuid().equals(r.commandUuid())).findFirst().orElseThrow();
            assertThat(log.getMethod()).isEqualTo(AccessMethod.REMOTE_UNLOCK);
            assertThat(log.getResult()).isEqualTo(AccessResult.GRANTED);
            assertThat(log.getAccount().getAccountId()).isEqualTo(managerId);
            assertThat(log.getAccessUnit().getUnitId()).isEqualTo(unitId);
        });
        assertThat(audits.findAll()).anyMatch(a -> "DOOR_UNLOCK".equals(a.getAction()) && "ACCESS_UNIT".equals(a.getEntityType()));
    }

    @Test
    void remoteLockUsesExplicitPermissionAndAuditWithoutGrantingAccess() {
        assertThatThrownBy(() -> unlockService.lock(userId,unitId)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> unlockService.lock(otherManagerId,unitId)).isInstanceOf(BusinessException.class);
        tx.executeWithoutResult(s -> units.findById(unitId).orElseThrow().setRemoteUnlockEnabled(false));
        long logsBefore=accessLogs.count();
        CommandResponse result=unlockService.lock(managerId,unitId);
        assertThat(gateway.sent.get(0).type()).isEqualTo("DOOR_LOCK");
        ackService.handleAck(uid,result.commandUuid(),true,"LOCK_WAITING_FOR_DOOR");
        assertThat(commandService.getOwnCommand(managerId,result.commandUuid()).status()).isEqualTo(CommandStatus.ACKNOWLEDGED);
        assertThat(accessLogs.count()).isEqualTo(logsBefore);
        assertThat(audits.findAll()).anyMatch(a -> "DOOR_LOCK".equals(a.getAction()) && "ACCESS_UNIT".equals(a.getEntityType()));
        tx.executeWithoutResult(s -> memberships.findById(new UserAccessId(userId,unitId)).orElseThrow().setAllowRemoteUnlock(true));
        CommandResponse memberCommand=unlockService.lock(userId,unitId);
        assertThat(commandService.getOwnCommand(userId,memberCommand.commandUuid()).status()).isEqualTo(CommandStatus.SENT);
    }

    @Test
    void guardsRejectForeignManagerOfflineDeviceAndDisabledUnlock() {
        assertThatThrownBy(() -> unlockService.unlock(otherManagerId, unitId))
                .isInstanceOfSatisfying(BusinessException.class, ex -> assertThat(ex.getStatus()).isEqualTo(HttpStatus.FORBIDDEN));
        assertThatThrownBy(() -> fingerprintService.startEnroll(managerId, unitId, otherManagerId, new AddFingerprintRequest("a")))
                .isInstanceOfSatisfying(BusinessException.class, ex -> assertThat(ex.getStatus()).isEqualTo(HttpStatus.NOT_FOUND));
        tx.executeWithoutResult(s -> {
            Device d = devices.findByDeviceUid(uid).orElseThrow();
            d.setLastSeenAt(LocalDateTime.now().minusSeconds(120));
        });
        assertThatThrownBy(() -> pinService.changePin(managerId, unitId, new ChangePinRequest("123456", "123456")))
                .isInstanceOfSatisfying(BusinessException.class, ex -> assertThat(ex.getStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
        tx.executeWithoutResult(s -> units.findById(unitId).orElseThrow().setRemoteUnlockEnabled(false));
        assertThatThrownBy(() -> unlockService.unlock(managerId, unitId))
                .isInstanceOfSatisfying(BusinessException.class, ex -> assertThat(ex.getStatus()).isEqualTo(HttpStatus.CONFLICT));
        assertThat(gateway.sent).isEmpty();
    }

    @Test
    void gatewayFailureMarksFailedAndTimeoutsDifferByType() {
        gateway.fail = true;
        CommandResponse failed = unlockService.unlock(managerId, unitId);
        assertThat(status(failed.commandUuid())).isEqualTo(CommandStatus.FAILED);
        gateway.fail = false;

        CommandResponse unlock = unlockService.unlock(managerId, unitId);
        CommandResponse pin = pinService.changePin(managerId, unitId, new ChangePinRequest("222222", "222222"));
        jdbc.update("update commands set requested_at = ? where command_uuid in (?, ?)",
                LocalDateTime.now().minusSeconds(30), unlock.commandUuid(), pin.commandUuid());
        scheduler.expireCommands();
        assertThat(status(unlock.commandUuid())).isEqualTo(CommandStatus.TIMEOUT);
        assertThat(status(pin.commandUuid())).isEqualTo(CommandStatus.SENT);
        jdbc.update("update commands set requested_at = ? where command_uuid = ?",
                LocalDateTime.now().minusSeconds(90), pin.commandUuid());
        scheduler.expireCommands();
        assertThat(status(pin.commandUuid())).isEqualTo(CommandStatus.TIMEOUT);

        // late ACK is still applied
        ackService.handleAck(uid, pin.commandUuid(), true, "OK");
        assertThat(status(pin.commandUuid())).isEqualTo(CommandStatus.ACKNOWLEDGED);
        assertThat(encoder.matches("222222", units.findById(unitId).orElseThrow().getAccessPinHash())).isTrue();
    }
}
