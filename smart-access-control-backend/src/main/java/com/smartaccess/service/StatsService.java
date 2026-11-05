package com.smartaccess.service;

import com.smartaccess.exception.BusinessException;
import com.smartaccess.model.AccessLog;
import com.smartaccess.model.AccessUnit;
import com.smartaccess.model.Device;
import com.smartaccess.model.enumtype.AccessResult;
import com.smartaccess.model.enumtype.DeviceType;
import com.smartaccess.repository.AccessLogRepository;
import com.smartaccess.repository.DeviceRepository;
import com.smartaccess.repository.TelemetryRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Thống kê cho chủ cửa: lượt ra vào theo ngày, chuỗi telemetry, xuất lịch sử CSV. */
@Service
@Transactional(readOnly = true)
public class StatsService {
    public record Point(LocalDateTime at, String value, String unit) {}
    public record DailyAccess(LocalDate day, long granted, long denied) {}

    static final Duration MAX_TELEMETRY_RANGE = Duration.ofDays(7);
    static final int MAX_DAYS = 31;
    static final int MAX_CSV_ROWS = 10_000;
    static final String CSV_HEADER = "thoi_gian,phuong_thuc,ket_qua,nguoi_dung,ly_do";
    private static final DateTimeFormatter CSV_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final ManagerAccessGuard guard;
    private final AccessLogRepository accessLogs;
    private final TelemetryRepository telemetry;
    private final DeviceRepository devices;
    private final Clock clock;

    /** Giờ hệ thống, cùng nguồn với LocalDateTime.now() mà backend dùng khi ghi access_logs/telemetry. */
    @org.springframework.beans.factory.annotation.Autowired
    public StatsService(ManagerAccessGuard guard, AccessLogRepository accessLogs, TelemetryRepository telemetry,
            DeviceRepository devices) {
        this(guard, accessLogs, telemetry, devices, Clock.systemDefaultZone());
    }

    StatsService(ManagerAccessGuard guard, AccessLogRepository accessLogs, TelemetryRepository telemetry,
            DeviceRepository devices, Clock clock) {
        this.guard = guard;
        this.accessLogs = accessLogs;
        this.telemetry = telemetry;
        this.devices = devices;
        this.clock = clock;
    }

    /** Luôn trả đủ {@code days} phần tử (ngày không có dữ liệu = 0), phần tử cuối là hôm nay. */
    public List<DailyAccess> dailyAccess(Long managerId, Long unitId, int days) {
        if (days < 1 || days > MAX_DAYS) throw new BusinessException(HttpStatus.BAD_REQUEST, "Số ngày phải từ 1 đến " + MAX_DAYS);
        guard.requireManagedUnit(managerId, unitId);
        LocalDate today = LocalDate.now(clock);
        LocalDate first = today.minusDays(days - 1L);
        Map<LocalDate, long[]> counts = new LinkedHashMap<>();
        for (LocalDate d = first; !d.isAfter(today); d = d.plusDays(1)) counts.put(d, new long[2]);
        // Gom trong Java để chạy giống nhau trên MySQL và H2 (hàm ngày khác nhau).
        for (AccessLog log : accessLogs.findByAccessUnit_UnitIdAndOccurredAtBetweenOrderByOccurredAtAsc(
                unitId, first.atStartOfDay(), today.plusDays(1).atStartOfDay())) {
            long[] c = counts.get(log.getOccurredAt().toLocalDate());
            if (c == null) continue;
            if (log.getResult() == AccessResult.GRANTED) c[0]++;
            else if (log.getResult() == AccessResult.DENIED) c[1]++;
        }
        List<DailyAccess> result = new ArrayList<>();
        counts.forEach((day, c) -> result.add(new DailyAccess(day, c[0], c[1])));
        return result;
    }

    /** Mặc định 24 giờ gần nhất; tối đa 7 ngày; metric phải là metric telemetry đã biết. */
    public List<Point> telemetry(Long managerId, Long unitId, String metric, LocalDateTime from, LocalDateTime to) {
        String unit = TelemetryService.METRICS.get(metric);
        if (unit == null) throw new BusinessException(HttpStatus.BAD_REQUEST, "Chỉ số không hợp lệ: " + metric);
        LocalDateTime end = to == null ? LocalDateTime.now(clock) : to;
        LocalDateTime start = from == null ? end.minusHours(24) : from;
        if (!start.isBefore(end)) throw new BusinessException(HttpStatus.BAD_REQUEST, "Khoảng thời gian không hợp lệ");
        if (Duration.between(start, end).compareTo(MAX_TELEMETRY_RANGE) > 0)
            throw new BusinessException(HttpStatus.BAD_REQUEST, "Chỉ xem tối đa 7 ngày mỗi lần");
        guard.requireManagedUnit(managerId, unitId);
        Device controller = devices.findFirstByAccessUnit_UnitIdAndDeviceType(unitId, DeviceType.DOOR_CONTROLLER).orElse(null);
        if (controller == null) return List.of();
        return telemetry.findByDevice_DeviceIdAndMetricNameAndOccurredAtBetweenOrderByOccurredAt(
                        controller.getDeviceId(), metric, start, end)
                .stream().map(t -> new Point(t.getOccurredAt(), t.getMetricValue(), unit)).toList();
    }

    /** CSV RFC 4180 có BOM UTF-8 để Excel đọc đúng tiếng Việt; tối đa MAX_CSV_ROWS dòng. */
    public String accessLogCsv(Long managerId, Long unitId, LocalDateTime from, LocalDateTime to) {
        LocalDateTime end = to == null ? LocalDateTime.now(clock) : to;
        LocalDateTime start = from == null ? end.minusDays(30) : from;
        if (!start.isBefore(end)) throw new BusinessException(HttpStatus.BAD_REQUEST, "Khoảng thời gian không hợp lệ");
        AccessUnit unit = guard.requireManagedUnit(managerId, unitId);
        StringBuilder csv = new StringBuilder("﻿").append(CSV_HEADER).append("\r\n");
        int rows = 0;
        for (AccessLog log : accessLogs.findByAccessUnit_UnitIdAndOccurredAtBetweenOrderByOccurredAtAsc(
                unit.getUnitId(), start, end)) {
            if (rows++ >= MAX_CSV_ROWS) break;
            csv.append(cell(log.getOccurredAt().format(CSV_TIME))).append(',')
                    .append(cell(log.getMethod() == null ? "" : log.getMethod().name())).append(',')
                    .append(cell(log.getResult() == null ? "" : log.getResult().name())).append(',')
                    .append(cell(log.getAccount() == null ? "" : log.getAccount().getFullName())).append(',')
                    .append(cell(log.getReasonCode())).append("\r\n");
        }
        return csv.toString();
    }

    static String cell(String value) {
        if (value == null) return "";
        boolean quote = value.contains(",") || value.contains("\"") || value.contains("\n") || value.contains("\r");
        return quote ? "\"" + value.replace("\"", "\"\"") + "\"" : value;
    }
}
