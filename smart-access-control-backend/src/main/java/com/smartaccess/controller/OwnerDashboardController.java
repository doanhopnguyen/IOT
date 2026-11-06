package com.smartaccess.controller;

import com.smartaccess.dto.unit.UnitSettings;
import com.smartaccess.security.AccountPrincipal;
import com.smartaccess.service.StatsService;
import com.smartaccess.service.UnitSettingsService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.List;

/** Thống kê, telemetry, xuất CSV và cài đặt cửa — chỉ chủ cửa của chính cửa đó. */
@RestController
@RequestMapping("/api/manager/units/{unitId}")
public class OwnerDashboardController {
    private final StatsService stats;
    private final UnitSettingsService settings;

    public OwnerDashboardController(StatsService stats, UnitSettingsService settings) {
        this.stats = stats;
        this.settings = settings;
    }

    @GetMapping("/stats/access")
    public List<StatsService.DailyAccess> dailyAccess(@AuthenticationPrincipal AccountPrincipal principal,
            @PathVariable Long unitId, @RequestParam(defaultValue = "7") int days) {
        return stats.dailyAccess(principal.accountId(), unitId, days);
    }

    @GetMapping("/telemetry")
    public List<StatsService.Point> telemetry(@AuthenticationPrincipal AccountPrincipal principal,
            @PathVariable Long unitId, @RequestParam String metric,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to) {
        return stats.telemetry(principal.accountId(), unitId, metric, from, to);
    }

    @GetMapping("/access-logs.csv")
    public ResponseEntity<byte[]> csv(@AuthenticationPrincipal AccountPrincipal principal, @PathVariable Long unitId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to) {
        byte[] body = stats.accessLogCsv(principal.accountId(), unitId, from, to).getBytes(StandardCharsets.UTF_8);
        return ResponseEntity.ok()
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"lich-su-cua-" + unitId + ".csv\"")
                .body(body);
    }

    @GetMapping("/settings")
    public UnitSettings.Response settings(@AuthenticationPrincipal AccountPrincipal principal, @PathVariable Long unitId) {
        return settings.get(principal.accountId(), unitId);
    }

    @PatchMapping("/settings")
    public UnitSettings.Response updateSettings(@AuthenticationPrincipal AccountPrincipal principal,
            @PathVariable Long unitId, @RequestBody UnitSettings.Request request) {
        return settings.update(principal.accountId(), unitId, request);
    }
}
