package com.smartaccess.service;

import com.smartaccess.exception.BusinessException;
import com.smartaccess.model.AccessLog;
import com.smartaccess.model.AccessUnit;
import com.smartaccess.model.Account;
import com.smartaccess.model.enumtype.AccessMethod;
import com.smartaccess.model.enumtype.AccessResult;
import com.smartaccess.repository.AccessLogRepository;
import com.smartaccess.repository.DeviceRepository;
import com.smartaccess.repository.TelemetryRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import java.time.*;
import java.util.List;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class StatsServiceTest {
    final ManagerAccessGuard guard = mock(ManagerAccessGuard.class);
    final AccessLogRepository logs = mock(AccessLogRepository.class);
    final TelemetryRepository telemetry = mock(TelemetryRepository.class);
    final DeviceRepository devices = mock(DeviceRepository.class);
    final ZoneId zone = ZoneId.of("Asia/Ho_Chi_Minh");
    final Clock clock = Clock.fixed(LocalDateTime.of(2026, 11, 5, 21, 0).atZone(zone).toInstant(), zone);
    final StatsService service = new StatsService(guard, logs, telemetry, devices, clock);

    @BeforeEach void setup() {
        AccessUnit unit = new AccessUnit(); unit.setUnitId(3L);
        when(guard.requireManagedUnit(1L, 3L)).thenReturn(unit);
        when(logs.findByAccessUnit_UnitIdAndOccurredAtBetweenOrderByOccurredAtAsc(anyLong(), any(), any())).thenReturn(List.of());
    }

    AccessLog log(AccessResult result, LocalDateTime at, String user, String reason) {
        AccessLog l = new AccessLog(); l.setResult(result); l.setOccurredAt(at); l.setMethod(AccessMethod.PIN);
        l.setReasonCode(reason);
        if (user != null) { Account a = new Account(); a.setFullName(user); l.setAccount(a); }
        return l;
    }

    @Test void unitWithoutDataReturnsZeroFilledDays() {
        var days = service.dailyAccess(1L, 3L, 7);
        assertThat(days).hasSize(7);
        assertThat(days).allMatch(d -> d.granted() == 0 && d.denied() == 0);
        assertThat(days.get(6).day()).isEqualTo(LocalDate.of(2026, 11, 5));
    }

    @Test void countsGrantedAndDeniedPerDay() {
        LocalDateTime yesterday = LocalDateTime.of(2026, 11, 4, 9, 0);
        when(logs.findByAccessUnit_UnitIdAndOccurredAtBetweenOrderByOccurredAtAsc(eq(3L), any(), any())).thenReturn(List.of(
                log(AccessResult.GRANTED, yesterday, null, null), log(AccessResult.GRANTED, yesterday.plusHours(1), null, null),
                log(AccessResult.DENIED, LocalDateTime.of(2026, 11, 5, 8, 0), null, null)));
        var days = service.dailyAccess(1L, 3L, 7);
        assertThat(days.get(5)).isEqualTo(new StatsService.DailyAccess(LocalDate.of(2026, 11, 4), 2, 0));
        assertThat(days.get(6)).isEqualTo(new StatsService.DailyAccess(LocalDate.of(2026, 11, 5), 0, 1));
    }

    @Test void dayCountOutsideRangeIs400() {
        assertThatThrownBy(() -> service.dailyAccess(1L, 3L, 0)).isInstanceOfSatisfying(BusinessException.class,
                e -> assertThat(e.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST));
        assertThatThrownBy(() -> service.dailyAccess(1L, 3L, 32)).isInstanceOf(BusinessException.class);
    }

    @Test void telemetryRangeOver7DaysIs400() {
        LocalDateTime to = LocalDateTime.of(2026, 11, 5, 0, 0);
        assertThatThrownBy(() -> service.telemetry(1L, 3L, "rssi", to.minusDays(8), to))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST));
    }

    @Test void unknownMetricIs400() {
        assertThatThrownBy(() -> service.telemetry(1L, 3L, "password", null, null))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST));
    }

    @Test void unitWithoutControllerHasEmptyTelemetry() {
        assertThat(service.telemetry(1L, 3L, "rssi", null, null)).isEmpty();
    }

    @Test void foreignManagerIs403AndNothingIsRead() {
        when(guard.requireManagedUnit(2L, 3L)).thenThrow(new BusinessException(HttpStatus.FORBIDDEN, "no"));
        assertThatThrownBy(() -> service.dailyAccess(2L, 3L, 7)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.accessLogCsv(2L, 3L, null, null)).isInstanceOf(BusinessException.class);
        verifyNoInteractions(logs);
    }

    @Test void csvHasBomHeaderAndEscapesCells() {
        when(logs.findByAccessUnit_UnitIdAndOccurredAtBetweenOrderByOccurredAtAsc(eq(3L), any(), any())).thenReturn(List.of(
                log(AccessResult.DENIED, LocalDateTime.of(2026, 11, 5, 8, 0, 1), "Nguyễn \"A\", B", "LOCAL_ACCESS_DENIED")));
        String csv = service.accessLogCsv(1L, 3L, null, null);
        assertThat(csv).startsWith("﻿" + StatsService.CSV_HEADER + "\r\n");
        assertThat(csv).contains("2026-11-05 08:00:01,PIN,DENIED,\"Nguyễn \"\"A\"\", B\",LOCAL_ACCESS_DENIED\r\n");
    }
}
