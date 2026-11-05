package com.smartaccess.service;

import com.smartaccess.model.Device;
import com.smartaccess.model.enumtype.AccessResult;
import com.smartaccess.model.enumtype.AlertStatus;
import com.smartaccess.model.enumtype.EventSeverity;
import com.smartaccess.repository.AccessLogRepository;
import com.smartaccess.repository.DeviceRepository;
import com.smartaccess.repository.EventRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/** Số liệu tổng quan toàn hệ thống cho admin (đề bài mục 4.6: dashboard quản trị). */
@Service
@Transactional(readOnly = true)
public class AdminDashboardService {
    public record AccessToday(long granted, long denied) {}
    public record Summary(Map<String, Long> devicesByLifecycle, long online, long offline, long openAlerts,
            long criticalAlerts, AccessToday accessToday) {}

    private static final List<AlertStatus> ACTIVE = List.of(AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED);
    private final DeviceRepository devices;
    private final EventRepository events;
    private final AccessLogRepository accessLogs;
    private final Clock clock;

    @Autowired
    public AdminDashboardService(DeviceRepository devices, EventRepository events, AccessLogRepository accessLogs) {
        this(devices, events, accessLogs, Clock.systemDefaultZone());
    }

    AdminDashboardService(DeviceRepository devices, EventRepository events, AccessLogRepository accessLogs, Clock clock) {
        this.devices = devices;
        this.events = events;
        this.accessLogs = accessLogs;
        this.clock = clock;
    }

    public Summary summary() {
        LocalDateTime now = LocalDateTime.now(clock);
        LocalDateTime onlineSince = now.minusSeconds(ManagerAccessGuard.ONLINE_WINDOW_SEC);
        Map<String, Long> byLifecycle = new TreeMap<>();
        long online = 0, offline = 0;
        for (Device d : devices.findAll()) {
            byLifecycle.merge(d.getLifecycleStatus() == null ? "UNKNOWN" : d.getLifecycleStatus().name(), 1L, Long::sum);
            // Online cùng cửa sổ 90 giây với app; thiết bị chưa từng kết nối tính là offline.
            if (d.getLastSeenAt() != null && !d.getLastSeenAt().isBefore(onlineSince)) online++;
            else offline++;
        }
        LocalDateTime today = LocalDate.now(clock).atStartOfDay();
        return new Summary(byLifecycle, online, offline,
                events.countByAlertStatusIn(ACTIVE),
                events.countByAlertStatusInAndSeverity(ACTIVE, EventSeverity.CRITICAL),
                new AccessToday(accessLogs.countByResultAndOccurredAtGreaterThanEqual(AccessResult.GRANTED, today),
                        accessLogs.countByResultAndOccurredAtGreaterThanEqual(AccessResult.DENIED, today)));
    }
}
