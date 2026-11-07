package com.smartaccess.controller;

import com.smartaccess.dto.HistoryDtos.*;
import com.smartaccess.dto.EventInput;
import com.smartaccess.model.enumtype.EventSeverity;
import com.smartaccess.service.AlertService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;
import org.springframework.format.annotation.DateTimeFormat;
import java.time.LocalDateTime;

@RestController
@RequestMapping("/api/alerts")
public class AlertController {
    private final AlertService service;
    public AlertController(AlertService service) {
        this.service = service;
    }
    @GetMapping
    public PageResponse<Alert> list(@RequestParam(required = false) Long accessUnitId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to,
            @RequestParam(required = false) EventSeverity severity,
            @RequestParam(required = false) Long relatedUserId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "30") int size) {
        return service.list(accessUnitId, from, to, severity, relatedUserId, page, size);
    }
    @GetMapping("/{id}")
    public Alert detail(@PathVariable Long id) {
        return service.detail(id);
    }
    @GetMapping("/statistics")
    public AlertStatistics statistics(@RequestParam(defaultValue = "7") int days,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) java.time.LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) java.time.LocalDate to,
            @RequestParam(required = false) EventSeverity severity,
            @RequestParam(required = false) Long relatedUserId) {
        if (from == null && to == null) {
            if (days != 1 && days != 7 && days != 30)
                throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "Chọn 1, 7 hoặc 30 ngày");
            to = java.time.LocalDate.now(); from = to.minusDays(days - 1);
        }
        return service.statistics(from, to, severity, relatedUserId);
    }
    @GetMapping("/users")
    public java.util.List<Reference> users() { return service.users(); }
    public record StatusChange(@jakarta.validation.constraints.NotNull com.smartaccess.model.enumtype.AlertStatus status) {}
    @PatchMapping("/{id}")
    public Alert updateStatus(@PathVariable Long id, @Valid @RequestBody StatusChange change) {
        return service.updateStatus(id, change.status());
    }
    // Manager-only integration/testing endpoint. Device producers should call AlertService.record after their own authentication.
    @PostMapping
    public Alert record(@Valid @RequestBody EventInput input) {
        return service.recordForManager(input);
    }
}
