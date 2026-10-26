package com.smartaccess.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.smartaccess.model.*;
import com.smartaccess.model.enumtype.*;
import com.smartaccess.repository.*;
import java.time.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Camera tin cậy nhận diện mẫu; chỉ máy chủ mới quyết định quyền mở cửa. */
@Service
public class FaceRecognitionService {
    public static final String MODEL = "buffalo_l/w600k_r50:v1";
    private final DeviceRepository devices;
    private final CredentialRepository credentials;
    private final UserAccessRepository memberships;
    private final AccessLogRepository logs;
    private final CommandRepository commands;
    private final DeviceCommandService dispatcher;
    private final ManagerAccessGuard guard;
    private final boolean allowUnverified;
    private final double threshold;

    public FaceRecognitionService(DeviceRepository devices, CredentialRepository credentials,
            UserAccessRepository memberships, AccessLogRepository logs, CommandRepository commands,
            DeviceCommandService dispatcher, ManagerAccessGuard guard,
            @Value("${app.face.allow-unverified-liveness:false}") boolean allowUnverified,
            @Value("${app.face.match-threshold:0.5}") double threshold) {
        this.devices = devices; this.credentials = credentials; this.memberships = memberships;
        this.logs = logs; this.commands = commands; this.dispatcher = dispatcher; this.guard = guard;
        if (!Double.isFinite(threshold) || threshold <= 0 || threshold > 1) throw new IllegalArgumentException("Ngưỡng nhận diện khuôn mặt không hợp lệ.");
        this.allowUnverified = allowUnverified; this.threshold = threshold;
    }

    @Transactional
    public void receive(String uid, JsonNode event) {
        // Tuần tự hóa các lần gửi lại từ camera, kể cả khi MQTT QoS 1 gửi đồng thời.
        Device camera = devices.findByDeviceUidForUpdate(uid).orElseThrow();
        if (camera.getDeviceType() != DeviceType.FACE_CAMERA_NODE
                || camera.getLifecycleStatus() != DeviceLifecycleStatus.ACTIVE || camera.getAccessUnit() == null) return;
        if (!event.path("schemaVersion").isIntegralNumber() || event.path("schemaVersion").asInt() != 1)
            throw new IllegalArgumentException("Phiên bản dữ liệu khuôn mặt không được hỗ trợ.");
        if (event.hasNonNull("credentialId") && (!event.get("credentialId").isIntegralNumber()
                || !event.get("credentialId").canConvertToLong() || event.get("credentialId").longValue() <= 0))
            throw new IllegalArgumentException("Mã mẫu xác thực không hợp lệ.");
        if (!event.path("score").isNumber()) throw new IllegalArgumentException("Điểm so khớp không hợp lệ.");
        String eventId = event.path("eventUuid").asText();
        if (!UUID.fromString(eventId).toString().equals(eventId)) throw new IllegalArgumentException("Mã sự kiện không hợp lệ.");
        // Mã sự kiện duy nhất toàn hệ thống ngăn gửi lặp giữa các node camera.
        if (logs.findByAccessUuid(eventId).isPresent()) return;
        Instant occurred = Instant.parse(event.path("occurredAt").asText());
        Instant now = Instant.now();
        if (occurred.isBefore(now.minusSeconds(15)) || occurred.isAfter(now.plusSeconds(5))) return;
        AccessUnit unit = camera.getAccessUnit();
        AccessLog entry = new AccessLog();
        entry.setAccessUuid(eventId); entry.setAccessUnit(unit); entry.setSourceDevice(camera);
        entry.setMethod(AccessMethod.FACE);
        entry.setOccurredAt(LocalDateTime.ofInstant(occurred, ZoneId.systemDefault()));
        entry.setResult(AccessResult.DENIED);
        String reason = "UNKNOWN_FACE";
        Credential credential = event.hasNonNull("credentialId") && event.get("credentialId").canConvertToLong()
                ? credentials.findById(event.get("credentialId").longValue()).orElse(null) : null;
        double score = event.path("score").asDouble(Double.NaN);
        if (!unit.isFaceEnabled()) reason = "FACE_DISABLED";
        else if (!MODEL.equals(event.path("model").asText())) reason = "MODEL_MISMATCH";
        else if (!Double.isFinite(score) || score < threshold || score > 1.0) reason = "BELOW_THRESHOLD";
        else if (!("LIVE".equals(event.path("liveness").asText())
                || (allowUnverified && "NOT_CHECKED".equals(event.path("liveness").asText())))) reason = "LIVENESS_REQUIRED";
        else if (credential != null) {
            Account account = credential.getAccount();
            boolean owner = unit.getManager() != null && unit.getManager().getAccountId().equals(account.getAccountId());
            boolean permitted = owner || memberships.findById(new UserAccessId(account.getAccountId(), unit.getUnitId()))
                    .map(UserAccess::isAllowFace).orElse(false);
            if (credential.getCredentialType() != CredentialType.FACE || credential.getStatus() != CredentialStatus.ACTIVE
                    || !MODEL.equals(credential.getEmbeddingModel())) reason = "CREDENTIAL_NOT_ACTIVE";
            else if (account.getStatus() != AccountStatus.ACTIVE || !permitted) reason = "ACCESS_REVOKED";
            else {
                entry.setAccount(account); entry.setCredential(credential);
                Device controller;
                try { controller = guard.requireOnlineController(unit.getUnitId()); }
                catch (RuntimeException offline) { save(entry, AccessResult.ERROR, "CONTROLLER_OFFLINE"); return; }
                // Tuần tự hóa lệnh mở cùng một cửa khi có nhiều node camera.
                controller = devices.findByDeviceUidForUpdate(controller.getDeviceUid()).orElseThrow();
                if (commands.existsByDevice_DeviceIdAndCommandTypeAndStatusIn(controller.getDeviceId(),
                        RemoteUnlockService.DOOR_UNLOCK, List.of(CommandStatus.PENDING, CommandStatus.SENT))) {
                    save(entry, AccessResult.DENIED, "DOOR_BUSY"); return;
                }
                save(entry, AccessResult.ERROR, "WAITING_ACK");
                Map<String, Object> payload = Map.of("unitId", unit.getUnitId(), "accessMethod", "FACE",
                        "accountId", account.getAccountId(), "credentialId", credential.getCredentialId(),
                        "cameraId", camera.getDeviceId());
                Map<String, Object> wire = Map.of("durationSec", unit.getUnlockDurationSec().intValue(),
                        "issuedAt", now.getEpochSecond(), "ttlSec", RemoteUnlockService.UNLOCK_TTL_SEC);
                dispatcher.dispatchWithUuid(controller, account.getAccountId(), RemoteUnlockService.DOOR_UNLOCK,
                        payload, wire, eventId);
                return;
            }
        }
        save(entry, AccessResult.DENIED, reason);
    }

    private void save(AccessLog entry, AccessResult result, String reason) {
        entry.setResult(result); entry.setReasonCode(reason); logs.saveAndFlush(entry);
    }
}
