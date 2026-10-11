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
    public AlertService(EventRepository events, DeviceRepository devices, CurrentAccountService current) {
        this.events = events;
        this.devices = devices;
        this.current = current;
    }
    public PageResponse<Alert> list(Long unitId, LocalDateTime from, LocalDateTime to, EventSeverity severity, int page, int size) {
        AccessLogService.validate(from, to, page, size);
        Long accountId = current.requireAccount().getAccountId();
        Specification<Event> spec = (r, q, c) -> c.equal(r.join("device").join("accessUnit").join("manager").get("accountId"), accountId);
        if (unitId != null) spec = spec.and((r, q, c) -> c.equal(r.get("device").get("accessUnit").get("unitId"), unitId));
        if (from != null) spec = spec.and((r, q, c) -> c.greaterThanOrEqualTo(r.get("occurredAt"), from));
        if (to != null) spec = spec.and((r, q, c) -> c.lessThanOrEqualTo(r.get("occurredAt"), to));
        if (severity != null) spec = spec.and((r, q, c) -> c.equal(r.get("severity"), severity));
        var data = events.findAll(spec, PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "occurredAt", "eventId")));
        return new PageResponse<>(data.stream().map(AlertService::dto).toList(), page, size, data.getTotalElements(), data.hasNext());
    }
    public Alert detail(Long id) {
        Long accountId = current.requireAccount().getAccountId();
        Event event = events.findById(id).orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Alert not found"));
        requireManager(event.getDevice(), accountId);
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
                e.getOccurredAt());
    }
}
