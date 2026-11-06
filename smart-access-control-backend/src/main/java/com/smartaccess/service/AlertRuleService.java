package com.smartaccess.service;

import com.smartaccess.config.RealtimeConfig;
import com.smartaccess.model.Device;
import com.smartaccess.model.Event;
import com.smartaccess.model.Telemetry;
import com.smartaccess.model.enumtype.AccessResult;
import com.smartaccess.model.enumtype.AlertStatus;
import com.smartaccess.model.enumtype.DeviceLifecycleStatus;
import com.smartaccess.model.enumtype.DeviceType;
import com.smartaccess.model.enumtype.EventSeverity;
import com.smartaccess.repository.AccessLogRepository;
import com.smartaccess.repository.DeviceRepository;
import com.smartaccess.repository.EventRepository;
import com.smartaccess.repository.TelemetryRepository;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Quy tắc cảnh báo tự sinh cho bộ điều khiển cửa đang hoạt động:
 * DEVICE_OFFLINE (WARNING) khi quá OFFLINE_AFTER_SEC không có heartbeat;
 * DOOR_LEFT_OPEN (CRITICAL) khi cửa mở lâu hơn access_units.door_open_timeout_sec;
 * REPEATED_DENIED (CRITICAL) khi có ≥ DENIED_LIMIT lượt bị từ chối trong DENIED_WINDOW_SEC;
 * SENSOR_FAULT (WARNING) khi cảm biến vân tay báo chưa sẵn sàng liên tục quá SENSOR_FAULT_AFTER_SEC.
 * Mỗi (thiết bị, loại) có tối đa một cảnh báo OPEN/ACKNOWLEDGED. Hết điều kiện thì tự chuyển RESOLVED,
 * trừ REPEATED_DENIED (nghi xâm nhập) phải do chủ cửa xem và xử lý.
 */
@Service
public class AlertRuleService {
    public static final String DEVICE_OFFLINE = "DEVICE_OFFLINE";
    public static final String DOOR_LEFT_OPEN = "DOOR_LEFT_OPEN";
    public static final String REPEATED_DENIED = "REPEATED_DENIED";
    public static final String SENSOR_FAULT = "SENSOR_FAULT";
    static final long OFFLINE_AFTER_SEC = 300;
    static final long DENIED_WINDOW_SEC = 120;
    static final long DENIED_LIMIT = 5;
    /** Dây cảm biến chập chờn làm fingerReady nháy false vài giây; chỉ báo khi kéo dài. */
    static final long SENSOR_FAULT_AFTER_SEC = 60;
    private static final List<AlertStatus> ACTIVE = List.of(AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED);
    private static final String DOOR_CLOSED = "doorClosed";
    private static final String OPEN_VALUE = "false";
    private static final String FINGER_READY = "fingerReady";

    private final DeviceRepository devices;
    private final EventRepository events;
    private final TelemetryRepository telemetry;
    private final AccessLogRepository accessLogs;
    private final ApplicationEventPublisher notifications;

    public AlertRuleService(DeviceRepository devices, EventRepository events, TelemetryRepository telemetry,
            AccessLogRepository accessLogs, ApplicationEventPublisher notifications) {
        this.devices = devices;
        this.events = events;
        this.telemetry = telemetry;
        this.accessLogs = accessLogs;
        this.notifications = notifications;
    }

    /** Trả số cảnh báo mới được tạo. */
    @Transactional
    public int evaluate(LocalDateTime now) {
        int created = 0;
        boolean changed = false;
        for (Device device : devices.findByDeviceTypeAndLifecycleStatusAndAccessUnitIsNotNull(
                DeviceType.DOOR_CONTROLLER, DeviceLifecycleStatus.ACTIVE)) {
            // Chưa từng kết nối thì chưa có gì để báo mất kết nối.
            if (device.getLastSeenAt() == null) continue;
            boolean offline = device.getLastSeenAt().isBefore(now.minusSeconds(OFFLINE_AFTER_SEC));
            Outcome o1 = apply(device, DEVICE_OFFLINE, offline, true, EventSeverity.WARNING,
                    "Bộ điều khiển " + device.getDeviceName() + " mất kết nối hơn " + OFFLINE_AFTER_SEC / 60 + " phút", now);
            // Khi offline, trạng thái cửa trong telemetry đã cũ: không kết luận cửa còn mở.
            Outcome o2 = offline ? Outcome.NONE : apply(device, DOOR_LEFT_OPEN, doorOpenTooLong(device, now),
                    true, EventSeverity.CRITICAL, "Cửa " + device.getDeviceName() + " mở quá "
                            + device.getAccessUnit().getDoorOpenTimeoutSec() + " giây", now);
            long denied = accessLogs.countByAccessUnit_UnitIdAndResultAndOccurredAtGreaterThanEqual(
                    device.getAccessUnit().getUnitId(), AccessResult.DENIED, now.minusSeconds(DENIED_WINDOW_SEC));
            Outcome o3 = apply(device, REPEATED_DENIED, denied >= DENIED_LIMIT, false, EventSeverity.CRITICAL,
                    "Cửa " + device.getDeviceName() + " bị từ chối " + denied + " lần trong "
                            + DENIED_WINDOW_SEC / 60 + " phút, nghi có người thử mở trái phép", now);
            Outcome o4 = offline ? Outcome.NONE : apply(device, SENSOR_FAULT, sensorFault(device, now), true,
                    EventSeverity.WARNING, "Cảm biến vân tay của " + device.getDeviceName() + " không phản hồi", now);
            for (Outcome o : List.of(o1, o2, o3, o4)) {
                if (o == Outcome.CREATED) created++;
                changed |= o != Outcome.NONE;
            }
        }
        if (changed) notifications.publishEvent(new RealtimeConfig.DeviceUpdated());
        return created;
    }

    private enum Outcome { NONE, CREATED, RESOLVED }

    private Outcome apply(Device device, String type, boolean condition, boolean autoResolve, EventSeverity severity,
            String message, LocalDateTime now) {
        Optional<Event> active = events.findFirstByDevice_DeviceIdAndEventTypeAndAlertStatusIn(device.getDeviceId(), type, ACTIVE);
        if (condition && active.isEmpty()) {
            Event event = new Event();
            event.setEventUuid(UUID.randomUUID().toString());
            event.setDevice(device);
            event.setEventType(type);
            event.setSeverity(severity);
            event.setAlertStatus(AlertStatus.OPEN);
            event.setMessage(message.length() > 255 ? message.substring(0, 255) : message);
            event.setOccurredAt(now.truncatedTo(ChronoUnit.MILLIS));
            events.save(event);
            return Outcome.CREATED;
        }
        if (!condition && autoResolve && active.isPresent()) {
            active.get().setAlertStatus(AlertStatus.RESOLVED); // Lưu bằng dirty checking trong transaction.
            return Outcome.RESOLVED;
        }
        return Outcome.NONE;
    }

    private boolean sensorFault(Device device, LocalDateTime now) {
        return telemetry.findFirstByDevice_DeviceIdAndMetricNameOrderByOccurredAtDesc(device.getDeviceId(), FINGER_READY)
                .filter(t -> OPEN_VALUE.equals(t.getMetricValue()))
                .map(t -> t.getOccurredAt().isBefore(now.minusSeconds(SENSOR_FAULT_AFTER_SEC)))
                .orElse(false);
    }

    /**
     * Telemetry doorClosed chỉ ghi khi đổi hoặc theo nhịp keepalive, nên bản ghi mới nhất không cho biết
     * lúc cửa bắt đầu mở. Lấy lần đầu "false" sau lần cuối cửa còn đóng/không rõ.
     */
    private boolean doorOpenTooLong(Device device, LocalDateTime now) {
        Long id = device.getDeviceId();
        Optional<Telemetry> latest = telemetry.findFirstByDevice_DeviceIdAndMetricNameOrderByOccurredAtDesc(id, DOOR_CLOSED);
        if (latest.isEmpty() || !OPEN_VALUE.equals(latest.get().getMetricValue())) return false;
        LocalDateTime lastNotOpen = telemetry
                .findFirstByDevice_DeviceIdAndMetricNameAndMetricValueNotOrderByOccurredAtDesc(id, DOOR_CLOSED, OPEN_VALUE)
                .map(Telemetry::getOccurredAt).orElse(LocalDateTime.of(1970, 1, 1, 0, 0));
        LocalDateTime openedAt = telemetry
                .findFirstByDevice_DeviceIdAndMetricNameAndMetricValueAndOccurredAtAfterOrderByOccurredAtAsc(
                        id, DOOR_CLOSED, OPEN_VALUE, lastNotOpen)
                .map(Telemetry::getOccurredAt).orElse(latest.get().getOccurredAt());
        return openedAt.isBefore(now.minusSeconds(device.getAccessUnit().getDoorOpenTimeoutSec()));
    }
}
