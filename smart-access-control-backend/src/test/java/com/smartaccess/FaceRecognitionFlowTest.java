package com.smartaccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.smartaccess.model.*;
import com.smartaccess.model.enumtype.*;
import com.smartaccess.repository.*;
import com.smartaccess.scheduler.CommandTimeoutScheduler;
import com.smartaccess.service.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.*;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

/** Uses real authorization, database transactions and AFTER_COMMIT dispatch, not AI accuracy fixtures. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE, properties = {
        "spring.datasource.url=jdbc:h2:mem:faceflow;MODE=MySQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa", "spring.datasource.password=", "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.flyway.enabled=false", "spring.jpa.hibernate.ddl-auto=create-drop", "app.face.allow-unverified-liveness=false",
        "app.mqtt.enabled=false"})
class FaceRecognitionFlowTest {
    record Sent(String uid, String uuid, String type, Map<String, Object> data) { }
    @TestConfiguration
    static class Config {
        @Bean @Primary RecordingGateway recordingFaceGateway() { return new RecordingGateway(); }
    }
    static class RecordingGateway implements DeviceGateway {
        List<Sent> sent = new ArrayList<>(); boolean fail;
        public void send(String uid, String uuid, String type, Map<String, Object> data) {
            if (fail) throw new IllegalStateException("Broker unavailable");
            sent.add(new Sent(uid, uuid, type, data));
        }
    }
    @Autowired RecordingGateway gateway;
    @Autowired FaceRecognitionService faces;
    @Autowired CommandAckService acks;
    @Autowired CommandTimeoutScheduler scheduler;
    @Autowired AccountRepository accounts;
    @Autowired AccessUnitRepository units;
    @Autowired DeviceRepository devices;
    @Autowired CredentialRepository credentials;
    @Autowired UserAccessRepository memberships;
    @Autowired CommandRepository commands;
    @Autowired AccessLogRepository logs;
    @Autowired TransactionTemplate tx;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;
    Long accountId, ownerId, unitId, credentialId;
    String cameraUid, controllerUid;
    static int sequence;

    @BeforeEach
    void seed() {
        gateway.sent.clear(); gateway.fail = false;
        int n = ++sequence;
        tx.executeWithoutResult(s -> {
            Account owner = account("owner" + n), member = account("member" + n);
            AccessUnit unit = new AccessUnit(); unit.setManager(owner); unit.setUnitName("Face door " + n); units.save(unit);
            Device camera = device("CAM-" + n, DeviceType.FACE_CAMERA_NODE, unit);
            Device controller = device("CTRL-" + n, DeviceType.DOOR_CONTROLLER, unit);
            UserAccess membership = new UserAccess(); membership.setAccount(member); membership.setAccessUnit(unit);
            membership.setAllowFace(true); memberships.save(membership);
            Credential c = new Credential(); c.setAccount(member); c.setCredentialType(CredentialType.FACE);
            c.setEmbeddingModel(FaceEmbedding.MODEL); c.setFaceEmbedding(new byte[512 * Float.BYTES]); credentials.save(c);
            accountId = member.getAccountId(); ownerId = owner.getAccountId(); unitId = unit.getUnitId();
            credentialId = c.getCredentialId(); cameraUid = camera.getDeviceUid(); controllerUid = controller.getDeviceUid();
        });
    }

    private Account account(String name) {
        Account a = new Account(); a.setFullName(name); a.setEmail(name + "@face.test"); a.setPasswordHash("not-used"); return accounts.save(a);
    }
    private Device device(String uid, DeviceType type, AccessUnit unit) {
        Device d = new Device(); d.setDeviceUid(uid); d.setDeviceName(uid); d.setDeviceType(type); d.setAccessUnit(unit);
        d.setLifecycleStatus(DeviceLifecycleStatus.ACTIVE); d.setLastSeenAt(LocalDateTime.now()); return devices.save(d);
    }
    private ObjectNode event() {
        return json.createObjectNode().put("schemaVersion", 1).put("eventUuid", UUID.randomUUID().toString())
                .put("occurredAt", Instant.now().toString()).put("model", FaceRecognitionService.MODEL)
                .put("credentialId", credentialId).put("score", 0.8).put("liveness", "LIVE");
    }
    private void assertLog(String id, AccessResult result, String reason) {
        AccessLog log = logs.findByAccessUuid(id).orElseThrow();
        assertThat(log.getMethod()).isEqualTo(AccessMethod.FACE);
        assertThat(log.getResult()).isEqualTo(result); assertThat(log.getReasonCode()).isEqualTo(reason);
    }

    @Test
    void duplicateEventAndAckProduceOneFaceEntryWithTheRecognizedMember() {
        ObjectNode event = event(); String id = event.path("eventUuid").asText();
        faces.receive(cameraUid, event); faces.receive(cameraUid, event);
        assertThat(gateway.sent).hasSize(1);
        assertThat(gateway.sent.get(0).uid()).isEqualTo(controllerUid);
        assertThat(gateway.sent.get(0).data()).containsKeys("issuedAt", "ttlSec", "durationSec");
        assertLog(id, AccessResult.ERROR, "WAITING_ACK");
        acks.handleAck("other-controller", id, true, "wrong device");
        assertLog(id, AccessResult.ERROR, "WAITING_ACK");
        acks.handleAck(controllerUid, id, true, "SIMULATED_OPEN");
        acks.handleAck(controllerUid, id, true, "duplicate");
        assertLog(id, AccessResult.GRANTED, null);
        tx.executeWithoutResult(s -> {
            AccessLog log = logs.findByAccessUuid(id).orElseThrow();
            assertThat(log.getAccount().getAccountId()).isEqualTo(accountId).isNotEqualTo(ownerId);
            assertThat(log.getCredential().getCredentialId()).isEqualTo(credentialId);
            assertThat(log.getSourceDevice().getDeviceUid()).isEqualTo(cameraUid);
        });
        assertThat(commands.findByCommandUuid(id).orElseThrow().getStatus()).isEqualTo(CommandStatus.ACKNOWLEDGED);
    }

    @Test
    void revokedPermissionAndRevokedCredentialCannotDispatchEvenWithCachedRecognition() {
        tx.executeWithoutResult(s -> memberships.findById(new UserAccessId(accountId, unitId)).orElseThrow().setAllowFace(false));
        ObjectNode first = event(); faces.receive(cameraUid, first);
        assertLog(first.path("eventUuid").asText(), AccessResult.DENIED, "ACCESS_REVOKED");
        tx.executeWithoutResult(s -> {
            memberships.findById(new UserAccessId(accountId, unitId)).orElseThrow().setAllowFace(true);
            credentials.findById(credentialId).orElseThrow().setStatus(CredentialStatus.REVOKED);
        });
        ObjectNode second = event(); faces.receive(cameraUid, second);
        assertLog(second.path("eventUuid").asText(), AccessResult.DENIED, "CREDENTIAL_NOT_ACTIVE");
        assertThat(gateway.sent).isEmpty();
    }

    @Test
    void cameraCannotUseAValidCredentialAtAnUnauthorizedDoor() {
        String otherCamera = "OTHER-" + sequence;
        tx.executeWithoutResult(s -> {
            AccessUnit other = new AccessUnit(); other.setUnitName("Other door"); other.setManager(accounts.getReferenceById(ownerId)); units.save(other);
            device(otherCamera, DeviceType.FACE_CAMERA_NODE, other);
        });
        ObjectNode e = event(); faces.receive(otherCamera, e);
        assertLog(e.path("eventUuid").asText(), AccessResult.DENIED, "ACCESS_REVOKED");
        assertThat(gateway.sent).isEmpty();
    }

    @Test
    void unknownPoorMatchAndFailedLivenessRemainDenied() {
        ObjectNode unknown = event(); unknown.remove("credentialId"); faces.receive(cameraUid, unknown);
        assertLog(unknown.path("eventUuid").asText(), AccessResult.DENIED, "UNKNOWN_FACE");
        ObjectNode low = event().put("score", 0.2); faces.receive(cameraUid, low);
        assertLog(low.path("eventUuid").asText(), AccessResult.DENIED, "BELOW_THRESHOLD");
        ObjectNode fake = event().put("liveness", "FAKE"); faces.receive(cameraUid, fake);
        assertLog(fake.path("eventUuid").asText(), AccessResult.DENIED, "LIVENESS_REQUIRED");
        ObjectNode unchecked = event().put("liveness", "NOT_CHECKED"); faces.receive(cameraUid, unchecked);
        assertLog(unchecked.path("eventUuid").asText(), AccessResult.DENIED, "LIVENESS_REQUIRED");
        assertThat(gateway.sent).isEmpty();
    }

    @Test
    void offlineControllerAndBrokerFailureNeverBecomeSuccessfulOpenings() {
        tx.executeWithoutResult(s -> devices.findByDeviceUid(controllerUid).orElseThrow().setLastSeenAt(LocalDateTime.now().minusMinutes(5)));
        ObjectNode offline = event(); faces.receive(cameraUid, offline);
        assertLog(offline.path("eventUuid").asText(), AccessResult.ERROR, "CONTROLLER_OFFLINE");
        tx.executeWithoutResult(s -> devices.findByDeviceUid(controllerUid).orElseThrow().setLastSeenAt(LocalDateTime.now()));
        gateway.fail = true;
        ObjectNode failed = event(); String id = failed.path("eventUuid").asText(); faces.receive(cameraUid, failed);
        assertLog(id, AccessResult.ERROR, "SEND_FAILED");
        assertThat(commands.findByCommandUuid(id).orElseThrow().getStatus()).isEqualTo(CommandStatus.FAILED);
        acks.handleAck(controllerUid, id, true, "late"); assertLog(id, AccessResult.ERROR, "SEND_FAILED");
    }

    @Test
    void timeoutAndLateAckCannotResurrectAFaceOpening() {
        ObjectNode e = event(); String id = e.path("eventUuid").asText(); faces.receive(cameraUid, e);
        jdbc.update("update commands set requested_at=? where command_uuid=?", LocalDateTime.now().minusSeconds(30), id);
        scheduler.expireCommands();
        assertThat(commands.findByCommandUuid(id).orElseThrow().getStatus()).isEqualTo(CommandStatus.TIMEOUT);
        assertLog(id, AccessResult.ERROR, "ACK_TIMEOUT");
        acks.handleAck(controllerUid, id, true, "late success");
        assertLog(id, AccessResult.ERROR, "ACK_TIMEOUT");
    }

    @Test
    void staleEventsAndUnknownSchemaNeverCreateCommandsOrLogs() {
        ObjectNode stale = event().put("occurredAt", Instant.now().minusSeconds(60).toString());
        faces.receive(cameraUid, stale);
        assertThat(logs.findByAccessUuid(stale.path("eventUuid").asText())).isEmpty();
        assertThatThrownBy(() -> faces.receive(cameraUid, event().put("schemaVersion", 2))).isInstanceOf(IllegalArgumentException.class);
        assertThat(gateway.sent).isEmpty();
    }
}
