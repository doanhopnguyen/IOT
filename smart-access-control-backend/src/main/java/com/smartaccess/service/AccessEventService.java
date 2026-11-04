package com.smartaccess.service;

import com.smartaccess.model.AccessLog;
import com.smartaccess.model.Credential;
import com.smartaccess.model.Device;
import com.smartaccess.model.enumtype.AccessMethod;
import com.smartaccess.model.enumtype.AccessResult;
import com.smartaccess.model.enumtype.CredentialStatus;
import com.smartaccess.model.enumtype.CredentialType;
import com.smartaccess.repository.AccessLogRepository;
import com.smartaccess.repository.CredentialRepository;
import com.smartaccess.repository.DeviceRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.util.UUID;

/** Ghi lượt quét vân tay mà thiết bị đã tự so khớp tại chỗ. */
@Service
public class AccessEventService {
    private static final Logger log = LoggerFactory.getLogger(AccessEventService.class);

    private final DeviceRepository devices;
    private final CredentialRepository credentials;
    private final AccessLogRepository accessLogs;

    public AccessEventService(DeviceRepository devices, CredentialRepository credentials,
            AccessLogRepository accessLogs) {
        this.devices = devices;
        this.credentials = credentials;
        this.accessLogs = accessLogs;
    }

    /** The reported outcome describes the physical action, including events buffered while offline. */
    @Transactional
    public void recordLocal(String deviceUid, com.fasterxml.jackson.databind.JsonNode event) {
        String uuid = event.path("eventUuid").asText();
        if (!uuid.matches("[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}"))
            throw new IllegalArgumentException("Invalid event UUID");
        AccessMethod method = AccessMethod.valueOf(event.path("method").asText());
        if (method != AccessMethod.RFID && method != AccessMethod.FINGERPRINT && method != AccessMethod.PIN)
            throw new IllegalArgumentException("Invalid local method");
        AccessResult result = AccessResult.valueOf(event.path("result").asText());
        if (result != AccessResult.GRANTED && result != AccessResult.DENIED)
            throw new IllegalArgumentException("Invalid local result");
        Device device = devices.findByDeviceUidForUpdate(deviceUid).orElseThrow();
        var existing = accessLogs.findByAccessUuid(uuid);
        if (existing.isPresent()) {
            if (!existing.get().getSourceDevice().getDeviceId().equals(device.getDeviceId()))
                throw new IllegalArgumentException("Event belongs to another device");
            return; // Commit completed before MQTT access-ack; retrying cannot duplicate logs.
        }
        if (device.getAccessUnit() == null) throw new IllegalArgumentException("Unassigned controller");
        Credential credential = null;
        if (method != AccessMethod.PIN) {
            CredentialType type = method == AccessMethod.RFID ? CredentialType.RFID : CredentialType.FINGERPRINT;
            credential = credentials.findByDevice_DeviceIdAndCredentialTypeAndStatus(
                    device.getDeviceId(), type, CredentialStatus.ACTIVE).stream().filter(c ->
                    method == AccessMethod.RFID
                            ? normalizeUid(c.getRfidUid()).equals(normalizeUid(event.path("rfidUid").asText()))
                            : c.getLocalTemplateId() != null && c.getLocalTemplateId().intValue() == event.path("templateId").asInt(-1))
                    .findFirst().orElse(null);
        }
        AccessLog entry = new AccessLog();
        entry.setAccessUuid(uuid); entry.setAccessUnit(device.getAccessUnit()); entry.setSourceDevice(device);
        entry.setMethod(method); entry.setResult(result);
        long epoch = event.path("occurredAt").asLong(0);
        if (epoch < 0 || epoch > java.time.Instant.now().getEpochSecond() + 60)
            throw new IllegalArgumentException("Invalid event time");
        entry.setOccurredAt(epoch == 0 ? LocalDateTime.now() : LocalDateTime.ofInstant(
                java.time.Instant.ofEpochSecond(epoch), java.time.ZoneId.of("Asia/Ho_Chi_Minh")));
        if (epoch == 0) entry.setReasonCode("DEVICE_CLOCK_UNSYNCED");
        if (result == AccessResult.DENIED) entry.setReasonCode("LOCAL_ACCESS_DENIED");
        if (credential != null) { entry.setCredential(credential); entry.setAccount(credential.getAccount()); }
        else if (method != AccessMethod.PIN && result == AccessResult.GRANTED) entry.setReasonCode("OFFLINE_CREDENTIAL_CHANGED");
        accessLogs.saveAndFlush(entry);
    }

    private static String normalizeUid(String uid) {
        return uid == null ? "" : uid.replace(":", "").replace("-", "").toUpperCase(java.util.Locale.ROOT);
    }

    @Transactional
    public void recordFingerprint(String deviceUid, Integer templateId, boolean deviceGranted) {
        Device device = devices.findByDeviceUid(deviceUid).orElse(null);
        if (device == null || device.getAccessUnit() == null) {
            log.warn("Bỏ qua lượt quét từ thiết bị {} chưa gắn cửa", deviceUid);
            return;
        }
        Credential credential = templateId == null ? null : credentials
                .findFirstByDevice_DeviceIdAndCredentialTypeAndLocalTemplateIdAndStatus(device.getDeviceId(),
                        CredentialType.FINGERPRINT, templateId.shortValue(), CredentialStatus.ACTIVE)
                .orElse(null);

        AccessLog entry = new AccessLog();
        entry.setAccessUuid(UUID.randomUUID().toString());
        entry.setAccessUnit(device.getAccessUnit());
        entry.setSourceDevice(device);
        entry.setMethod(AccessMethod.FINGERPRINT);
        entry.setOccurredAt(LocalDateTime.now());
        if (!deviceGranted) {
            entry.setResult(AccessResult.DENIED);
            entry.setReasonCode("NO_MATCH");
        } else if (credential == null) {
            entry.setResult(AccessResult.DENIED);
            entry.setReasonCode("CREDENTIAL_NOT_ACTIVE");
        } else {
            entry.setResult(AccessResult.GRANTED);
            entry.setAccount(credential.getAccount());
            entry.setCredential(credential);
        }
        accessLogs.save(entry);
    }
}
