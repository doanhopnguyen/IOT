package com.smartaccess.service;

import com.smartaccess.model.Device;
import com.smartaccess.model.enumtype.AccessResult;
import com.smartaccess.model.enumtype.DeviceLifecycleStatus;
import com.smartaccess.model.enumtype.EventSeverity;
import com.smartaccess.repository.AccessLogRepository;
import com.smartaccess.repository.DeviceRepository;
import com.smartaccess.repository.EventRepository;
import org.junit.jupiter.api.Test;
import java.time.*;
import java.util.List;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AdminDashboardServiceTest {
    final DeviceRepository devices = mock(DeviceRepository.class);
    final EventRepository events = mock(EventRepository.class);
    final AccessLogRepository logs = mock(AccessLogRepository.class);
    final ZoneId zone = ZoneId.of("Asia/Ho_Chi_Minh");
    final LocalDateTime now = LocalDateTime.of(2026, 11, 5, 21, 0);
    final AdminDashboardService service = new AdminDashboardService(devices, events, logs,
            Clock.fixed(now.atZone(zone).toInstant(), zone));

    Device device(DeviceLifecycleStatus status, Integer secondsAgo) {
        Device d = new Device(); d.setLifecycleStatus(status);
        if (secondsAgo != null) d.setLastSeenAt(now.minusSeconds(secondsAgo));
        return d;
    }

    @Test void countsOnlineByHeartbeatWindowAndAlertsAndTodayAccess() {
        when(devices.findAll()).thenReturn(List.of(device(DeviceLifecycleStatus.ACTIVE, 30),
                device(DeviceLifecycleStatus.ACTIVE, 200), device(DeviceLifecycleStatus.REGISTERED, null)));
        when(events.countByAlertStatusIn(anyCollection())).thenReturn(3L);
        when(events.countByAlertStatusInAndSeverity(anyCollection(), eq(EventSeverity.CRITICAL))).thenReturn(1L);
        when(logs.countByResultAndOccurredAtGreaterThanEqual(AccessResult.GRANTED, now.toLocalDate().atStartOfDay())).thenReturn(12L);
        when(logs.countByResultAndOccurredAtGreaterThanEqual(AccessResult.DENIED, now.toLocalDate().atStartOfDay())).thenReturn(2L);
        var s = service.summary();
        assertThat(s.online()).isEqualTo(1);
        assertThat(s.offline()).isEqualTo(2);
        assertThat(s.devicesByLifecycle()).containsEntry("ACTIVE", 2L).containsEntry("REGISTERED", 1L);
        assertThat(s.openAlerts()).isEqualTo(3);
        assertThat(s.criticalAlerts()).isEqualTo(1);
        assertThat(s.accessToday()).isEqualTo(new AdminDashboardService.AccessToday(12, 2));
    }
}
