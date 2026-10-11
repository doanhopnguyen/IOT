package com.smartaccess.controller;

import com.smartaccess.dto.HistoryDtos.*;
import com.smartaccess.model.enumtype.*;
import com.smartaccess.service.AccessLogService;
import org.springframework.web.bind.annotation.*;
import org.springframework.format.annotation.DateTimeFormat;
import java.time.LocalDateTime;

@RestController
@RequestMapping("/api/access-logs")
public class AccessLogController {
    private final AccessLogService service;
    public AccessLogController(AccessLogService service) {
        this.service = service;
    }
    @GetMapping
    public PageResponse<Log> list(@RequestParam(required = false) Long accessUnitId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to,
            @RequestParam(required = false) AccessMethod method,
            @RequestParam(required = false) AccessResult result,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "30") int size) {
        return service.list(accessUnitId, from, to, method, result, page, size);
    }
}
