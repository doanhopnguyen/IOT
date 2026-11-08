package com.smartaccess.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.smartaccess.model.Device;
import com.smartaccess.model.Telemetry;
import com.smartaccess.repository.DeviceRepository;
import com.smartaccess.repository.TelemetryRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.function.Supplier;

/**
 * Lưu telemetry từ heartbeat 'status' (5 giây/lần). Để bảng không phình, mỗi metric chỉ được ghi khi
 * giá trị đổi hoặc đã quá KEEPALIVE_SEC từ lần ghi trước; RSSI chỉ tính là đổi khi lệch ít nhất RSSI_STEP dBm.
 * Thời điểm lấy theo giờ máy chủ vì đồng hồ thiết bị có thể chưa đồng bộ.
 */
@Service
public class TelemetryService {
    /** Metric được nhận và đơn vị đo; trường khác trong status (deviceSecret, requestId...) không bao giờ được lưu. */
    public static final Map<String, String> METRICS = metrics();
    static final long KEEPALIVE_SEC = 300;
    static final int RSSI_STEP = 5;
    private static final int MAX_VERSION_LENGTH = 50;

    private final TelemetryRepository telemetry;
    private final DeviceRepository devices;

    public TelemetryService(TelemetryRepository telemetry, DeviceRepository devices) {
        this.telemetry = telemetry;
        this.devices = devices;
    }

    private static Map<String, String> metrics() {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("doorClosed", "bool"); m.put("unlocked", "bool"); m.put("fingerReady", "bool");
        for (String name : new String[]{"hasDoorPin","adminPinSet","touchCalibrated","doorCalibrated","servoCalibrated"}) m.put(name,"bool");
        m.put("setupStage","state"); m.put("wifiSsid","text");
        m.put("lockAngle","deg"); m.put("openAngle","deg");
        m.put("servoRange","deg");
        m.put("lockPending","bool");m.put("unlockDurationSec","s");m.put("doorOpenTimeoutSec","s");
        m.put("autoLockWaitForClose","bool");
        m.put("pinFailureLimit","count");m.put("buzzerAlarm","state");m.put("buzzerOn","bool");
        m.put("servoCommandAngle","deg");m.put("servoDirection","state");
        m.put("droppedEvents", "count"); m.put("rssi", "dBm"); m.put("freeHeap", "bytes"); m.put("uptime", "s");
        return java.util.Collections.unmodifiableMap(m);
    }

    /** Khóa chống trùng: thiết bị gửi lại cùng requestId thì không sinh thêm dòng. */
    public static String messageUuid(String requestId, String metric) {
        return UUID.nameUUIDFromBytes((requestId + ":" + metric).getBytes(StandardCharsets.UTF_8)).toString();
    }

    @Transactional
    public void record(Device device, JsonNode status, String requestId) {
        // Device từ bước xác thực MQTT đã detached: nạp lại để thay đổi phiên bản được lưu.
        devices.findById(device.getDeviceId()).ifPresent(managed -> {
            copyVersion(status, "fw", managed::getFirmwareVersion, managed::setFirmwareVersion);
            copyVersion(status, "hw", managed::getHardwareVersion, managed::setHardwareVersion);
        });
        LocalDateTime now = LocalDateTime.now().truncatedTo(ChronoUnit.MILLIS);
        for (var metric : METRICS.entrySet()) {
            String value = value(metric.getKey(), status);
            if (value == null || !shouldStore(device, metric.getKey(), value, now)) continue;
            String uuid = messageUuid(requestId, metric.getKey());
            if (telemetry.existsByMessageUuid(uuid)) continue;
            Telemetry row = new Telemetry();
            row.setMessageUuid(uuid); row.setDevice(device);
            row.setMetricName(metric.getKey()); row.setMetricValue(value); row.setMeasurementUnit(metric.getValue());
            row.setOccurredAt(now);
            telemetry.save(row);
        }
    }

    /** Giá trị đã chuẩn hóa thành chuỗi, hoặc null nếu thiếu, sai kiểu hay ngoài khoảng hợp lệ. */
    private static String value(String metric, JsonNode status) {
        if (!status.has(metric)) return null;
        JsonNode node = status.get(metric);
        return switch (metric) {
            // Firmware gửi null khi chưa hiệu chỉnh cảm biến cửa: lưu "unknown" thay vì bỏ qua.
            case "doorClosed" -> node.isNull() ? "unknown" : node.isBoolean() ? String.valueOf(node.asBoolean()) : null;
            case "unlocked" -> node.isNull() ? "unknown" : node.isBoolean() ? String.valueOf(node.asBoolean()) : null;
            case "fingerReady", "hasDoorPin", "adminPinSet", "touchCalibrated", "doorCalibrated", "servoCalibrated", "lockPending", "autoLockWaitForClose", "buzzerOn" -> node.isBoolean() ? String.valueOf(node.asBoolean()) : null;
            case "unlockDurationSec" -> inRange(node,1,30);
            case "doorOpenTimeoutSec" -> inRange(node,10,600);
            case "pinFailureLimit" -> inRange(node,1,10);
            case "buzzerAlarm" -> node.isTextual() && node.asText().matches("NONE|PIN_FAILURE|DOOR_OPEN|PIN_AND_DOOR") ? node.asText() : null;
            case "setupStage" -> node.isTextual() && node.asText().matches("WIFI|SERVICE|CLAIM|PINS|TOUCH_[1-4]|DOOR_CLOSED|DOOR_OPEN|SERVO_LOCK|SERVO_OPEN|READY|WIFI_SETTINGS|RESETTING") ? node.asText() : null;
            case "servoDirection" -> node.isTextual() && node.asText().matches("UNKNOWN|INCREASE|DECREASE|HOLD") ? node.asText() : null;
            case "wifiSsid" -> node.isTextual() && node.asText().length()<=32 ? node.asText() : null;
            case "rssi" -> inRange(node, -120, 0);
            case "servoRange" -> node.isIntegralNumber() && (node.asInt()==180 || node.asInt()==360) ? node.asText() : null;
            case "lockAngle", "openAngle" -> inRange(node, 5, status.path("servoRange").asInt(180)==360?355:175);
            case "servoCommandAngle" -> node.isNull()?"unknown":inRange(node,5,status.path("servoRange").asInt(180)==360?355:175);
            case "freeHeap" -> inRange(node, 0, 16_777_216);
            case "droppedEvents", "uptime" -> inRange(node, 0, Long.MAX_VALUE);
            default -> null;
        };
    }

    private static String inRange(JsonNode node, long min, long max) {
        if (!node.isIntegralNumber()) return null;
        long v = node.asLong();
        return v < min || v > max ? null : String.valueOf(v);
    }

    private boolean shouldStore(Device device, String metric, String value, LocalDateTime now) {
        var previous = telemetry.findFirstByDevice_DeviceIdAndMetricNameOrderByOccurredAtDesc(device.getDeviceId(), metric);
        if (previous.isEmpty() || previous.get().getOccurredAt().isBefore(now.minusSeconds(KEEPALIVE_SEC))) return true;
        String old = previous.get().getMetricValue();
        if ("rssi".equals(metric)) {
            try { return Math.abs(Long.parseLong(old) - Long.parseLong(value)) >= RSSI_STEP; }
            catch (NumberFormatException e) { return true; }
        }
        // Thời gian chạy và RAM luôn thay đổi: chỉ ghi theo nhịp keepalive.
        if ("uptime".equals(metric) || "freeHeap".equals(metric)) return false;
        return !old.equals(value);
    }

    private static void copyVersion(JsonNode status, String field, Supplier<String> current, Consumer<String> setter) {
        JsonNode node = status.get(field);
        if (node == null || !node.isTextual()) return;
        String value = node.asText().trim();
        // Chỉ ghi khi đổi để heartbeat 5 giây không cập nhật bảng devices liên tục.
        if (!value.isEmpty() && value.length() <= MAX_VERSION_LENGTH && !value.equals(current.get())) setter.accept(value);
    }
}
