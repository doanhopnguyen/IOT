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
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

/**
 * Ghi lượt ra vào mà thiết bị đã tự quyết định tại chỗ (vân tay, RFID, PIN).
 * IllegalArgumentException nghĩa là sự kiện hỏng vĩnh viễn: gửi lại cũng không hợp lệ hơn.
 */
@Service
public class AccessEventService {
    private static final ZoneId ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

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
        if (method == AccessMethod.FINGERPRINT) {
            int templateId = event.path("templateId").asInt(-1);
            if (templateId > 0 && templateId <= Short.MAX_VALUE)
                credential = credentials.findFirstByDevice_DeviceIdAndCredentialTypeAndLocalTemplateIdAndStatus(
                        device.getDeviceId(), CredentialType.FINGERPRINT, (short) templateId, CredentialStatus.ACTIVE)
                        .orElse(null);
        } else if (method == AccessMethod.RFID) {
            // UID thẻ có thể được lưu kèm dấu ":" hoặc "-", nên so khớp sau khi chuẩn hóa.
            String rfidUid = normalizeUid(event.path("rfidUid").asText());
            credential = credentials.findByDevice_DeviceIdAndCredentialTypeAndStatus(
                    device.getDeviceId(), CredentialType.RFID, CredentialStatus.ACTIVE).stream()
                    .filter(c -> normalizeUid(c.getRfidUid()).equals(rfidUid)).findFirst().orElse(null);
        }
        AccessLog entry = new AccessLog();
        entry.setAccessUuid(uuid); entry.setAccessUnit(device.getAccessUnit()); entry.setSourceDevice(device);
        entry.setMethod(method); entry.setResult(result);
        // Giữ mọi lý do cùng lúc để lịch sử không mất việc thời điểm là do máy chủ thay thế.
        List<String> reasons = new ArrayList<>();
        long epoch = event.path("occurredAt").asLong(0);
        long now = java.time.Instant.now().getEpochSecond();
        if (epoch <= 0) {
            entry.setOccurredAt(LocalDateTime.now()); reasons.add("DEVICE_CLOCK_UNSYNCED");
        } else if (epoch > now + 60) {
            // Không từ chối sự kiện: thiết bị sẽ gửi lại mãi nếu không nhận được access-ack.
            entry.setOccurredAt(LocalDateTime.now()); reasons.add("DEVICE_CLOCK_INVALID");
        } else {
            entry.setOccurredAt(LocalDateTime.ofInstant(java.time.Instant.ofEpochSecond(epoch), ZONE));
        }
        if (result == AccessResult.DENIED) reasons.add("LOCAL_ACCESS_DENIED");
        // Chip từ chối thẻ/vân tay hợp lệ vì chủ cửa tạm khóa: không phải xác thực sai.
        if (result == AccessResult.DENIED && "LOCKDOWN".equals(event.path("reason").asText())) reasons.add("LOCKDOWN");
        if (credential != null) { entry.setCredential(credential); entry.setAccount(credential.getAccount()); }
        else if (method != AccessMethod.PIN && result == AccessResult.GRANTED) reasons.add("OFFLINE_CREDENTIAL_CHANGED");
        entry.setReasonCode(reasons.isEmpty() ? null : String.join(",", reasons));
        accessLogs.saveAndFlush(entry);
    }

    private static String normalizeUid(String uid) {
        return uid == null ? "" : uid.replace(":", "").replace("-", "").toUpperCase(java.util.Locale.ROOT);
    }
}
