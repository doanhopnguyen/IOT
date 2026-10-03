package com.smartaccess;

import com.smartaccess.model.*;
import com.smartaccess.model.enumtype.*;
import com.smartaccess.repository.*;
import jakarta.persistence.EntityManager;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;

/** Runs only against an explicitly supplied disposable MySQL database. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@EnabledIfEnvironmentVariable(named = "SMART_ACCESS_DB_TEST_URL", matches = ".+")
@Transactional
class DatabaseIntegrationTest {
    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", () -> System.getenv("SMART_ACCESS_DB_TEST_URL"));
        properties.add("spring.datasource.username",
                () -> System.getenv().getOrDefault("SMART_ACCESS_DB_TEST_USERNAME", "root"));
        properties.add("spring.datasource.password",
                () -> System.getenv().getOrDefault("SMART_ACCESS_DB_TEST_PASSWORD", ""));
        properties.add("spring.jpa.hibernate.ddl-auto", () -> "validate");
        properties.add("spring.flyway.enabled", () -> "true");
    }

    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    Flyway flyway;
    @Autowired
    EntityManager em;
    @Autowired
    AccountRepository accounts;
    @Autowired
    DeviceRepository devices;
    @Autowired
    UserAccessRepository userAccess;

    @Test
    void migrationCreatesSchemaAndRequiredConstraints() {
        assertThat(flyway.info().applied()).hasSize(1);
        assertThat(flyway.validateWithResult().validationSuccessful).isTrue();
        assertThat(jdbc.queryForList(
                "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME <> 'flyway_schema_history'",
                String.class))
                .containsExactlyInAnyOrder("accounts", "access_units", "devices", "user_access", "credentials",
                        "face_requests", "access_logs", "telemetry", "events", "commands", "audit_logs");
        assertThat(jdbc.queryForList(
                "SELECT COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_access' AND CONSTRAINT_NAME = 'PRIMARY' ORDER BY ORDINAL_POSITION",
                String.class))
                .containsExactly("account_id", "unit_id");
        assertThat(jdbc.queryForList(
                "SELECT CONCAT(COLUMN_NAME, '->', REFERENCED_TABLE_NAME, '.', REFERENCED_COLUMN_NAME) FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'face_requests' AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY ORDINAL_POSITION",
                String.class))
                .containsExactly("account_id->user_access.account_id", "unit_id->user_access.unit_id");
        assertThat(jdbc.queryForList(
                "SELECT CONCAT(TABLE_NAME, '.', COLUMN_NAME) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND NON_UNIQUE = 0 AND INDEX_NAME <> 'PRIMARY' AND TABLE_NAME <> 'flyway_schema_history'",
                String.class))
                .containsExactlyInAnyOrder("accounts.email", "accounts.phone", "devices.device_uid",
                        "access_logs.access_uuid", "telemetry.message_uuid", "events.event_uuid",
                        "commands.command_uuid");
        assertThat(jdbc.queryForList(
                "SELECT CONCAT(TABLE_NAME, ':', GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX)) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND INDEX_NAME LIKE 'idx_%' GROUP BY TABLE_NAME, INDEX_NAME",
                String.class))
                .containsExactlyInAnyOrder(
                        "access_units:manager_id", "devices:unit_id", "devices:lifecycle_status,last_seen_at",
                        "user_access:unit_id",
                        "credentials:account_id,credential_type,status", "credentials:rfid_uid,status",
                        "credentials:device_id,local_template_id,status",
                        "face_requests:unit_id,status", "face_requests:account_id,requested_at",
                        "access_logs:unit_id,occurred_at", "access_logs:account_id,occurred_at",
                        "access_logs:source_device_id,occurred_at",
                        "telemetry:device_id,occurred_at", "telemetry:device_id,metric_name,occurred_at",
                        "events:device_id,occurred_at", "events:alert_status,severity,occurred_at",
                        "commands:device_id,requested_at", "commands:requested_by,requested_at",
                        "audit_logs:actor_id,created_at");
        assertThat(jdbc.queryForList(
                "SELECT CONCAT(TABLE_NAME, '.', CONSTRAINT_NAME, ':', DELETE_RULE) FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()",
                String.class))
                .containsExactlyInAnyOrder(
                        "access_units.fk_access_units_manager_id:SET NULL", "devices.fk_devices_unit_id:SET NULL",
                        "user_access.fk_user_access_account_id:RESTRICT", "user_access.fk_user_access_unit_id:RESTRICT",
                        "credentials.fk_credentials_account_id:RESTRICT",
                        "credentials.fk_credentials_device_id:RESTRICT",
                        "face_requests.fk_face_requests_user_access:RESTRICT",
                        "access_logs.fk_access_logs_unit_id:RESTRICT",
                        "access_logs.fk_access_logs_source_device_id:RESTRICT",
                        "access_logs.fk_access_logs_account_id:RESTRICT",
                        "access_logs.fk_access_logs_credential_id:RESTRICT",
                        "telemetry.fk_telemetry_device_id:RESTRICT", "events.fk_events_device_id:RESTRICT",
                        "commands.fk_commands_device_id:RESTRICT", "commands.fk_commands_requested_by:RESTRICT",
                        "audit_logs.fk_audit_logs_actor_id:SET NULL");
    }

    private Account account() {
        Account account = new Account();
        account.setFullName("Database test");
        account.setEmail(UUID.randomUUID() + "@example.test");
        account.setPasswordHash("test-hash");
        return accounts.saveAndFlush(account);
    }

    @Test
    void allEntitiesRoundTripIncludingCompositeIdBlobJsonAndEnums() {
        Account account = account();
        AccessUnit unit = new AccessUnit();
        unit.setUnitName("Test unit");
        unit.setManager(account);
        em.persist(unit);
        Device device = new Device();
        device.setDeviceUid(UUID.randomUUID().toString());
        device.setDeviceName("Test device");
        device.setDeviceType(DeviceType.DOOR_CONTROLLER);
        device.setAccessUnit(unit);
        devices.saveAndFlush(device);
        UserAccess membership = new UserAccess();
        membership.setAccount(account);
        membership.setAccessUnit(unit);
        membership.setAllowFace(true);
        em.persist(membership);
        em.flush();
        Credential credential = new Credential();
        credential.setAccount(account);
        credential.setCredentialType(CredentialType.FACE);
        credential.setFaceEmbedding(new byte[] { 1, 2, 3 });
        credential.setEmbeddingModel("test-model");
        em.persist(credential);
        FaceRequest request = new FaceRequest();
        request.setAccount(account);
        request.setAccessUnit(unit);
        request.setRequestType(FaceRequestType.ENROLL);
        em.persist(request);
        LocalDateTime occurred = LocalDateTime.of(2026, 10, 3, 12, 30, 0, 123_000_000);
        AccessLog log = new AccessLog();
        log.setAccessUuid(UUID.randomUUID().toString());
        log.setAccessUnit(unit);
        log.setSourceDevice(device);
        log.setAccount(account);
        log.setCredential(credential);
        log.setMethod(AccessMethod.FACE);
        log.setResult(AccessResult.GRANTED);
        log.setOccurredAt(occurred);
        em.persist(log);
        Telemetry telemetry = new Telemetry();
        telemetry.setMessageUuid(UUID.randomUUID().toString());
        telemetry.setDevice(device);
        telemetry.setMetricName("DOOR_STATE");
        telemetry.setMetricValue("OPEN");
        telemetry.setOccurredAt(occurred);
        em.persist(telemetry);
        Event event = new Event();
        event.setEventUuid(UUID.randomUUID().toString());
        event.setDevice(device);
        event.setEventType("DOOR_LEFT_OPEN");
        event.setOccurredAt(occurred);
        em.persist(event);
        Command command = new Command();
        command.setCommandUuid(UUID.randomUUID().toString());
        command.setDevice(device);
        command.setRequestedBy(account);
        command.setCommandType("SYNC_CONFIG");
        command.setPayload(Map.of("enabled", true, "duration", 5));
        em.persist(command);
        AuditLog audit = new AuditLog();
        audit.setActor(account);
        audit.setAction("TEST");
        audit.setEntityType("DEVICE");
        audit.setEntityId(device.getDeviceId());
        audit.setDetails(Map.of("source", "test", "values", List.of(1, 2)));
        em.persist(audit);
        em.flush();
        em.clear();
        assertThat(userAccess.findById(new UserAccessId(account.getAccountId(), unit.getUnitId())).orElseThrow()
                .isAllowFace()).isTrue();
        assertThat(accounts.findByEmail(account.getEmail())).isPresent();
        assertThat(devices.findByDeviceUid(device.getDeviceUid())).isPresent();
        assertThat(em.find(Credential.class, credential.getCredentialId()).getFaceEmbedding()).containsExactly((byte) 1,
                (byte) 2, (byte) 3);
        assertThat(em.find(Command.class, command.getCommandId()).getPayload()).containsEntry("enabled", true)
                .containsEntry("duration", 5);
        assertThat(em.find(AuditLog.class, audit.getAuditLogId()).getDetails()).containsEntry("source", "test");
        assertThat(em.find(AccessLog.class, log.getAccessLogId()).getOccurredAt()).isEqualTo(occurred);
        assertThat(em.find(Telemetry.class, telemetry.getTelemetryId()).getReceivedAt()).isNotNull();
        assertThat(em.find(Event.class, event.getEventId()).getSeverity()).isEqualTo(EventSeverity.INFO);
        assertThat(em.find(FaceRequest.class, request.getRequestId()).getStatus()).isEqualTo(FaceRequestStatus.PENDING);
        assertThat(jdbc.queryForObject("SELECT status FROM accounts WHERE account_id = ?", String.class,
                account.getAccountId())).isEqualTo("ACTIVE");
    }

    @Test
    void databaseRejectsFaceRequestWithoutMembershipAndPreservesHistory() {
        Account account = account();
        AccessUnit unit = new AccessUnit();
        unit.setUnitName("Test unit");
        em.persist(unit);
        em.flush();
        assertThatThrownBy(() -> jdbc.update(
                "INSERT INTO face_requests (account_id, unit_id, request_type, requested_at) VALUES (?, ?, 'ENROLL', CURRENT_TIMESTAMP(3))",
                account.getAccountId(), unit.getUnitId()))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        jdbc.update("INSERT INTO user_access (account_id, unit_id) VALUES (?, ?)", account.getAccountId(),
                unit.getUnitId());
        jdbc.update(
                "INSERT INTO face_requests (account_id, unit_id, request_type, requested_at) VALUES (?, ?, 'ENROLL', CURRENT_TIMESTAMP(3))",
                account.getAccountId(), unit.getUnitId());
        assertThatThrownBy(() -> jdbc.update("DELETE FROM user_access WHERE account_id = ? AND unit_id = ?",
                account.getAccountId(), unit.getUnitId()))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }

    @Test
    void deletingUnreferencedManagerClearsNullableRelationships() {
        Account manager = account();
        AccessUnit unit = new AccessUnit();
        unit.setUnitName("Managed unit");
        unit.setManager(manager);
        em.persist(unit);
        AuditLog audit = new AuditLog();
        audit.setActor(manager);
        audit.setAction("TEST");
        audit.setEntityType("ACCOUNT");
        em.persist(audit);
        em.flush();
        jdbc.update("DELETE FROM accounts WHERE account_id = ?", manager.getAccountId());
        em.clear();
        assertThat(em.find(AccessUnit.class, unit.getUnitId()).getManager()).isNull();
        assertThat(em.find(AuditLog.class, audit.getAuditLogId()).getActor()).isNull();
    }
}
