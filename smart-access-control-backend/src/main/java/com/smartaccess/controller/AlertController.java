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
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "30") int size) {
        return service.list(accessUnitId, from, to, severity, page, size);
    }
    @GetMapping("/{id}")
    public Alert detail(@PathVariable Long id) {
        return service.detail(id);
    }
    // Manager-only integration/testing endpoint. Device producers should call AlertService.record after their own authentication.
    @PostMapping
    public Alert record(@Valid @RequestBody EventInput input) {
        return service.recordForManager(input);
    }
}
