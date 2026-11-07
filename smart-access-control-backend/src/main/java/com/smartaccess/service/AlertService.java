package com.smartaccess.service;

import com.smartaccess.dto.HistoryDtos.*;
import com.smartaccess.dto.EventInput;
import com.smartaccess.model.*;
import com.smartaccess.model.enumtype.*;
import com.smartaccess.repository.*;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.time.LocalDateTime;
import static org.springframework.http.HttpStatus.*;

@Service
@Transactional(readOnly = true)
@org.springframework.validation.annotation.Validated
public class AlertService {
    private final EventRepository events;
    private final DeviceRepository devices;
    private final CurrentAccountService current;
    private final AuditLogRepository audits;
    private final org.springframework.context.ApplicationEventPublisher notifications;
    public AlertService(EventRepository events, DeviceRepository devices, CurrentAccountService current,
            AuditLogRepository audits, org.springframework.context.ApplicationEventPublisher notifications) {
        this.events = events;
        this.devices = devices;
        this.current = current;
        this.audits = audits;
        this.notifications = notifications;
    }
    private static Specification<Event> managedBy(Long accountId) {
        return (r, q, c) -> c.equal(r.join("device").join("accessUnit").join("manager").get("accountId"), accountId);
    }

    public AlertStatistics statistics(int days) {
        if (days != 7 && days != 30) throw new ResponseStatusException(BAD_REQUEST, "Chọn 7 hoặc 30 ngày");
        var today = java.time.LocalDate.now();
        return statistics(today.minusDays(days - 1), today, null, null);
    }
    public java.util.List<Reference> users() {
        return events.findAlertUsers(current.requireAccount().getAccountId()).stream()
                .map(a -> new Reference(a.getAccountId(), a.getFullName())).toList();
    }
    private void validateUser(Long userId) {
        if (userId != null && users().stream().noneMatch(u -> u.id().equals(userId)))
            throw new ResponseStatusException(FORBIDDEN, "Người dùng không thuộc các cửa bạn quản lý");
    }
    private static Specification<Event> filtered(Long managerId, LocalDateTime from, LocalDateTime to,
            EventSeverity severity, Long userId) {
        Specification<Event> spec = managedBy(managerId);
        if (from != null) spec = spec.and((r, q, c) -> c.greaterThanOrEqualTo(r.get("occurredAt"), from));
        if (to != null) spec = spec.and((r, q, c) -> c.lessThanOrEqualTo(r.get("occurredAt"), to));
        if (severity != null) spec = spec.and((r, q, c) -> c.equal(r.get("severity"), severity));
        if (userId != null) spec = spec.and((r, q, c) -> c.equal(r.join("relatedAccounts").get("accountId"), userId));
        return spec;
    }
    public AlertStatistics statistics(java.time.LocalDate start, java.time.LocalDate end,
            EventSeverity severity, Long relatedUserId) {
        if (start == null || end == null || end.isBefore(start)
                || java.time.temporal.ChronoUnit.DAYS.between(start, end) > 365)
            throw new ResponseStatusException(BAD_REQUEST, "Khoảng thời gian hợp lệ tối đa 366 ngày");
        Long accountId = current.requireAccount().getAccountId();
        validateUser(relatedUserId);
        Specification<Event> scope = filtered(accountId, start.atStartOfDay(), end.atTime(23, 59, 59, 999_000_000), severity, relatedUserId);
        long total = events.count(scope);
        long unread = events.count(scope.and((r, q, c) -> c.equal(r.get("alertStatus"), AlertStatus.OPEN)));
        long urgent = events.count(scope.and((r, q, c) -> c.and(
                c.equal(r.get("severity"), EventSeverity.CRITICAL),
                r.get("alertStatus").in(AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED))));
        var buckets = new java.util.TreeMap<java.time.LocalDate, long[]>();
        for (var date = start; !date.isAfter(end); date = date.plusDays(1)) buckets.put(date, new long[3]);
        for (var row : events.countDailyForManager(accountId, start.atStartOfDay(), end.plusDays(1).atStartOfDay(), severity, relatedUserId)) {
            var date = java.time.LocalDate.of(row.getYear(), row.getMonth(), row.getDay());
            int index = switch (row.getSeverity()) { case INFO -> 0; case WARNING -> 1; case CRITICAL -> 2; };
            buckets.get(date)[index] = row.getTotal();
        }
        return new AlertStatistics(total, unread, urgent, buckets.entrySet().stream()
                .map(e -> new AlertDay(e.getKey(), e.getValue()[0], e.getValue()[1], e.getValue()[2])).toList());
    }
    public PageResponse<Alert> list(Long unitId, LocalDateTime from, LocalDateTime to, EventSeverity severity, int page, int size) {
        return list(unitId, from, to, severity, null, page, size);
    }
    public PageResponse<Alert> list(Long unitId, LocalDateTime from, LocalDateTime to, EventSeverity severity,
            Long relatedUserId, int page, int size) {
        AccessLogService.validate(from, to, page, size);
        Long accountId = current.requireAccount().getAccountId();
        validateUser(relatedUserId);
        Specification<Event> spec = filtered(accountId, from, to, severity, relatedUserId);
        if (unitId != null) spec = spec.and((r, q, c) -> c.equal(r.get("device").get("accessUnit").get("unitId"), unitId));
        var data = events.findAll(spec, PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "occurredAt", "eventId")));
        return new PageResponse<>(data.stream().map(AlertService::dto).toList(), page, size, data.getTotalElements(), data.hasNext());
    }
    public Alert detail(Long id) {
        Long accountId = current.requireAccount().getAccountId();
        Event event = events.findById(id).orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Alert not found"));
        requireManager(event.getDevice(), accountId);
        return dto(event);
    }
    /**
     * Chủ cửa xác nhận đã xem (OPEN→ACKNOWLEDGED) hoặc đã xử lý (OPEN/ACKNOWLEDGED→RESOLVED).
     * Chuyển trạng thái khác (mở lại, lùi trạng thái) trả 409; ghi audit ALERT_<STATUS>.
     */
    @Transactional
    public Alert updateStatus(Long id, AlertStatus target) {
        Account actor = current.requireAccount();
        Event event = events.findById(id).orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Alert not found"));
        requireManager(event.getDevice(), actor.getAccountId());
        AlertStatus from = event.getAlertStatus();
        if (target == AlertStatus.RESOLVED && java.util.Set.of(
                AlertRuleService.DEVICE_OFFLINE, AlertRuleService.DOOR_LEFT_OPEN, AlertRuleService.SENSOR_FAULT)
                .contains(event.getEventType()))
            throw new ResponseStatusException(CONFLICT, "Cảnh báo tự xử lý khi thiết bị phục hồi");
        boolean allowed = (target == AlertStatus.ACKNOWLEDGED && from == AlertStatus.OPEN)
                || (target == AlertStatus.RESOLVED && (from == AlertStatus.OPEN || from == AlertStatus.ACKNOWLEDGED));
        if (!allowed) throw new ResponseStatusException(CONFLICT, "Không thể chuyển cảnh báo từ " + from + " sang " + target);
        event.setAlertStatus(target);
        AuditLog audit = new AuditLog();
        audit.setActor(actor);
        audit.setAction("ALERT_" + target);
        audit.setEntityType("EVENT");
        audit.setEntityId(event.getEventId());
        audit.setDetails(java.util.Map.of("from", from.name(), "to", target.name(), "eventType", event.getEventType()));
        audits.save(audit);
        notifications.publishEvent(new com.smartaccess.config.RealtimeConfig.DeviceUpdated());
        return dto(event);
    }
    private static void requireManager(Device device, Long accountId) {
        var unit = device.getAccessUnit();
        if (unit == null || unit.getManager() == null || !accountId.equals(unit.getManager().getAccountId()))
            throw new ResponseStatusException(FORBIDDEN, "Access unit manager required");
    }
    // Internal integration point for future authenticated MQTT/device ingestion. No hardware detection here.
    @Transactional
    public Alert record(@jakarta.validation.Valid EventInput input) {
        Device device = devices.findById(input.deviceId()).orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Device not found"));
        var existing = events.findByEventUuid(input.eventUuid());
        if (existing.isPresent()) {
            if (!existing.get().getDevice().getDeviceId().equals(input.deviceId()))
                throw new ResponseStatusException(CONFLICT, "Event UUID belongs to another device");
            return dto(existing.get());
        }
        Event event = new Event();
        event.setDevice(device);
        event.setEventUuid(input.eventUuid());
        event.setEventType(input.eventType());
        event.setSeverity(input.severity());
        event.setMessage(input.message());
        event.setOccurredAt(input.occurredAt());
        event.setAlertStatus(AlertStatus.OPEN);
        return dto(events.save(event));
    }

    @Transactional
    public Alert recordForManager(@jakarta.validation.Valid EventInput input) {
        Device device = devices.findById(input.deviceId()).orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Device not found"));
        requireManager(device, current.requireAccount().getAccountId());
        return record(input);
    }
    private static Alert dto(Event e) {
        var d = e.getDevice();
        var u = d.getAccessUnit();
        return new Alert(e.getEventId(),
                u == null?null:new Reference(u.getUnitId(), u.getUnitName()),
                new Reference(d.getDeviceId(), d.getDeviceName()),
                e.getEventType(),
                e.getSeverity(),
                e.getAlertStatus(),
                e.getMessage(),
                e.getOccurredAt(),
                e.getRelatedAccounts().stream().sorted(java.util.Comparator.comparing(Account::getAccountId))
                    .map(a -> new Reference(a.getAccountId(), a.getFullName())).toList());
    }
}
