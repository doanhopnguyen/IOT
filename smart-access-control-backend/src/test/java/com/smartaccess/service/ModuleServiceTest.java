package com.smartaccess.service;

import com.smartaccess.dto.EventInput;
import com.smartaccess.model.*;
import com.smartaccess.model.enumtype.*;
import com.smartaccess.repository.*;
import org.junit.jupiter.api.*;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.web.server.ResponseStatusException;
import java.time.LocalDateTime;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ModuleServiceTest {
    CurrentAccountService current = mock(CurrentAccountService.class);
    Account manager;
    AccessUnit unit;
    Device device;
    @BeforeEach
    void setup() {
        manager = new Account();
        manager.setAccountId(7L);
        manager.setFullName("Manager");
        unit = new AccessUnit();
        unit.setUnitId(3L);
        unit.setUnitName("Door");
        unit.setManager(manager);
        device = new Device();
        device.setDeviceId(9L);
        device.setDeviceName("Controller");
        device.setAccessUnit(unit);
        when(current.requireAccount()).thenReturn(manager);
    }

    @Test
    void logsMapUnknownAccountErrorReasonAndPagination() {
        AccessLogRepository repository = mock(AccessLogRepository.class);
        AccessLog log = new AccessLog();
        log.setAccessLogId(1L);
        log.setAccessUnit(unit);
        log.setSourceDevice(device);
        log.setMethod(AccessMethod.PIN);
        log.setResult(AccessResult.ERROR);
        log.setReasonCode("DEVICE_ERROR");
        log.setOccurredAt(LocalDateTime.now());
        when(repository.findAll(any(Specification.class), any(Pageable.class)))
            .thenReturn(new PageImpl<>(List.of(log), PageRequest.of(0, 1), 2));
        var page = new AccessLogService(repository, current).list(3L, null, null, AccessMethod.PIN, AccessResult.ERROR, 0, 1);
        assertThat(page.items().get(0).account()).isNull();
        assertThat(page.items().get(0).reasonCode()).isEqualTo("DEVICE_ERROR");
        assertThat(page.items().get(0).device().id()).isEqualTo(9L);
        assertThat(page.hasNext()).isTrue();
        verify(current).requireAccount();
    }

    @Test
    void logsRejectInvalidRangeAndUnboundedPage() {
        var service = new AccessLogService(mock(AccessLogRepository.class), current);
        assertThatThrownBy(() -> service.list(null, LocalDateTime.now(), LocalDateTime.now().minusDays(1), null, null, 0, 30))
            .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> service.list(null, null, null, null, null, 0, 101)).isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void alertDetailAndCreationRejectOtherManager() {
        EventRepository repository = mock(EventRepository.class);
        DeviceRepository devices = mock(DeviceRepository.class);
        Event event = new Event();
        event.setDevice(device);
        event.setEventId(1L);
        when(repository.findById(1L)).thenReturn(Optional.of(event));
        when(devices.findById(9L)).thenReturn(Optional.of(device));
        Account stranger = new Account();
        stranger.setAccountId(8L);
        when(current.requireAccount()).thenReturn(stranger);
        var service = new AlertService(repository, devices, current);
        assertThatThrownBy(() -> service.detail(1L)).isInstanceOfSatisfying(ResponseStatusException.class,
                e -> assertThat(e.getStatusCode().value()).isEqualTo(403));
        assertThatThrownBy(() -> service.recordForManager(input())).isInstanceOf(ResponseStatusException.class);
        verify(repository, never()).save(any());
    }

    @Test
    void eventCreationPreservesSeverityAndRetriesDoNotDuplicate() {
        EventRepository repository = mock(EventRepository.class);
        DeviceRepository devices = mock(DeviceRepository.class);
        when(devices.findById(9L)).thenReturn(Optional.of(device));
        when(repository.save(any())).thenAnswer(invocation -> {
            Event e = invocation.getArgument(0); e.setEventId(4L); return e;
        }
        );
        var service = new AlertService(repository, devices, current);
        var result = service.recordForManager(input());
        assertThat(result.severity()).isEqualTo(EventSeverity.CRITICAL);
        assertThat(result.status()).isEqualTo(AlertStatus.OPEN);
        Event previous = new Event();
        previous.setDevice(device);
        previous.setEventId(4L);
        when(repository.findByEventUuid(input().eventUuid())).thenReturn(Optional.of(previous));
        assertThat(service.recordForManager(input()).id()).isEqualTo(4L);
        verify(repository, times(1)).save(any());
    }
    private EventInput input() {
        return new EventInput(9L,
                "12345678-1234-1234-1234-123456789abc",
                "DOOR_LEFT_OPEN",
                EventSeverity.CRITICAL,
                "Open too long",
                LocalDateTime.of(2026, 10, 7, 8, 0));
    }
}
