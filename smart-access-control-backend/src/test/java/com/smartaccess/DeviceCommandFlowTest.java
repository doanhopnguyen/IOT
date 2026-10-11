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
