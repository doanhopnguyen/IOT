package com.smartaccess.service;

import com.smartaccess.model.*;
import com.smartaccess.model.enumtype.*;
import com.smartaccess.repository.*;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.web.server.ResponseStatusException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@DataJpaTest(showSql = false, properties = {
    "spring.datasource.url=jdbc:h2:mem:alertstats;MODE=MySQL;DB_CLOSE_DELAY=-1",
    "spring.datasource.driver-class-name=org.h2.Driver", "spring.datasource.username=sa",
    "spring.datasource.password=", "spring.flyway.enabled=false",
    "spring.jpa.hibernate.ddl-auto=create-drop", "spring.jpa.show-sql=false", "logging.level.org.hibernate.SQL=OFF"
})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class AlertStatisticsTest {
    @Autowired EntityManager em;
    @Autowired EventRepository events;
    @Autowired DeviceRepository devices;
    @Autowired AuditLogRepository audits;
    final CurrentAccountService current = mock(CurrentAccountService.class);
    final ApplicationEventPublisher notifications = mock(ApplicationEventPublisher.class);
    AlertService service;
    Account owner;
    Device door;
    final LocalDateTime today = LocalDate.now().atStartOfDay();

    @BeforeEach void setup() {
        owner = account();
        door = door(owner);
        when(current.requireAccount()).thenReturn(owner);
        service = new AlertService(events, devices, current, audits, notifications);
    }

    @Test void statisticsCountAllPagesAndOnlyManagedDoorsWithCompleteDateBuckets() {
        for (int i = 0; i < 65; i++) event(door, EventSeverity.WARNING, AlertStatus.OPEN, today);
        event(door, EventSeverity.CRITICAL, AlertStatus.ACKNOWLEDGED, today.minusDays(6));
        event(door, EventSeverity.CRITICAL, AlertStatus.RESOLVED, today.minusDays(7));
        event(door, EventSeverity.INFO, AlertStatus.NONE, today.minusDays(29));
        event(door, EventSeverity.INFO, AlertStatus.NONE, today.minusDays(30));
        event(door(account()), EventSeverity.CRITICAL, AlertStatus.OPEN, today);
        event(door(null), EventSeverity.CRITICAL, AlertStatus.OPEN, today);
        em.flush();

        var week = service.statistics(7);
        assertThat(service.list(null, null, null, null, 0, 30).items()).hasSize(30);
        assertThat(week.total()).isEqualTo(66);
        assertThat(week.unread()).isEqualTo(65);
        assertThat(week.urgentUnresolved()).isEqualTo(1);
        assertThat(week.days()).hasSize(7);
        assertThat(week.days().get(0).critical()).isEqualTo(1);
        assertThat(week.days().get(1).warning()).isZero();
        assertThat(week.days().get(6).warning()).isEqualTo(65);
        var month = service.statistics(30);
        assertThat(month.days()).hasSize(30);
        assertThat(month.days().stream().mapToLong(d -> d.info()).sum()).isEqualTo(1);
        assertThat(month.days().stream().mapToLong(d -> d.critical()).sum()).isEqualTo(2);

        when(current.requireAccount()).thenReturn(account());
        var empty = service.statistics(7);
        assertThat(empty.total()).isZero();
        assertThat(empty.days()).hasSize(7).allSatisfy(d -> {
            assertThat(d.info() + d.warning() + d.critical()).isZero();
        });
        assertThatThrownBy(() -> service.statistics(8)).isInstanceOf(ResponseStatusException.class);
    }

    @Test void acknowledgeOnlyMarksReadAndManualResolutionUpdatesStatistics() {
        var alert = event(door, EventSeverity.CRITICAL, AlertStatus.OPEN, today);
        alert.setEventType("REPEATED_AUTH_FAILED");
        service.updateStatus(alert.getEventId(), AlertStatus.ACKNOWLEDGED);
        assertThat(service.statistics(7).unread()).isZero();
        assertThat(service.statistics(7).urgentUnresolved()).isEqualTo(1);
        service.updateStatus(alert.getEventId(), AlertStatus.RESOLVED);
        assertThat(service.statistics(7).urgentUnresolved()).isZero();
        assertThat(service.statistics(7).total()).isEqualTo(1);
        verify(notifications, times(2)).publishEvent(any(com.smartaccess.config.RealtimeConfig.DeviceUpdated.class));
    }

    @Test void physicalFaultsCannotBeResolvedManuallyButCanBeRead() {
        for (String type : new String[]{"DEVICE_OFFLINE", "DOOR_LEFT_OPEN", "SENSOR_FAULT", "REPEATED_WRONG_PIN"}) {
            var alert = event(door, EventSeverity.CRITICAL, AlertStatus.OPEN, today);
            alert.setEventType(type);
            assertThat(service.updateStatus(alert.getEventId(), AlertStatus.ACKNOWLEDGED).status())
                    .isEqualTo(AlertStatus.ACKNOWLEDGED);
            assertThatThrownBy(() -> service.updateStatus(alert.getEventId(), AlertStatus.RESOLVED))
                    .isInstanceOfSatisfying(ResponseStatusException.class,
                            e -> assertThat(e.getStatusCode().value()).isEqualTo(409));
            assertThat(alert.getAlertStatus()).isEqualTo(AlertStatus.ACKNOWLEDGED);
        }
    }

    @Test void combinedFiltersUseRealParticipantsAndMatchListCountsAndCharts() {
        Account member = account(), stranger = account();
        UserAccess access = new UserAccess(); access.setAccount(member); access.setAccessUnit(door.getAccessUnit()); em.persist(access);
        var first = event(door, EventSeverity.CRITICAL, AlertStatus.OPEN, today);
        first.getRelatedAccounts().add(member); first.getRelatedAccounts().add(owner);
        var last = event(door, EventSeverity.CRITICAL, AlertStatus.ACKNOWLEDGED, today.plusDays(1).minusNanos(1_000_000));
        last.getRelatedAccounts().add(member);
        event(door, EventSeverity.CRITICAL, AlertStatus.OPEN, today); // Device alert with no identified user.
        event(door, EventSeverity.WARNING, AlertStatus.OPEN, today).getRelatedAccounts().add(member);
        event(door, EventSeverity.CRITICAL, AlertStatus.OPEN, today.minusNanos(1_000_000)).getRelatedAccounts().add(member);
        event(door, EventSeverity.CRITICAL, AlertStatus.OPEN, today.plusDays(1)).getRelatedAccounts().add(member);
        event(door(stranger), EventSeverity.CRITICAL, AlertStatus.OPEN, today).getRelatedAccounts().add(member);
        em.flush();
        assertThat(service.users()).extracting(u -> u.id()).containsExactlyInAnyOrder(owner.getAccountId(), member.getAccountId());
        var summary = service.statistics(today.toLocalDate(), today.toLocalDate(), EventSeverity.CRITICAL, member.getAccountId());
        var list = service.list(null, today, today.plusDays(1).minusNanos(1_000_000), EventSeverity.CRITICAL, member.getAccountId(), 0, 30);
        assertThat(summary.total()).isEqualTo(2).isEqualTo(list.totalElements());
        assertThat(summary.unread()).isEqualTo(1);
        assertThat(summary.urgentUnresolved()).isEqualTo(2);
        assertThat(summary.days().get(0).critical()).isEqualTo(2);
        assertThat(summary.days().get(0).warning()).isZero();
        assertThat(list.items()).extracting(a -> a.id()).containsExactly(last.getEventId(), first.getEventId());
        assertThat(service.detail(first.getEventId()).relatedUsers()).hasSize(2);
        assertThatThrownBy(() -> service.statistics(today.toLocalDate(), today.toLocalDate(), null, stranger.getAccountId()))
                .isInstanceOfSatisfying(ResponseStatusException.class, e -> assertThat(e.getStatusCode().value()).isEqualTo(403));
        assertThatThrownBy(() -> service.list(null, today, today, null, stranger.getAccountId(), 0, 30))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> service.statistics(today.toLocalDate(), today.minusDays(1).toLocalDate(), null, null))
                .isInstanceOf(ResponseStatusException.class);
    }

    Account account() {
        Account a = new Account(); a.setFullName("Owner"); a.setPasswordHash("test-hash");
        em.persist(a); return a;
    }
    Device door(Account manager) {
        AccessUnit u = new AccessUnit(); u.setUnitName("Door"); u.setManager(manager); em.persist(u);
        Device d = new Device(); d.setDeviceUid(UUID.randomUUID().toString()); d.setDeviceName("Controller");
        d.setDeviceType(DeviceType.DOOR_CONTROLLER); d.setAccessUnit(u); em.persist(d); return d;
    }
    Event event(Device device, EventSeverity severity, AlertStatus status, LocalDateTime at) {
        Event e = new Event(); e.setDevice(device); e.setEventUuid(UUID.randomUUID().toString());
        e.setEventType("REPEATED_WRONG_PIN"); e.setSeverity(severity); e.setAlertStatus(status);
        e.setOccurredAt(at); em.persist(e); return e;
    }
}
