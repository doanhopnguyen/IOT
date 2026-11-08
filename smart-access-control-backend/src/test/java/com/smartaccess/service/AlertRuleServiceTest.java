package com.smartaccess.service;

import com.smartaccess.model.AccessLog;
import com.smartaccess.model.AccessUnit;
import com.smartaccess.model.Device;
import com.smartaccess.model.Event;
import com.smartaccess.model.Telemetry;
import com.smartaccess.model.enumtype.AccessMethod;
import com.smartaccess.model.enumtype.AccessResult;
import com.smartaccess.model.enumtype.AlertStatus;
import com.smartaccess.model.enumtype.DeviceLifecycleStatus;
import com.smartaccess.model.enumtype.DeviceType;
import com.smartaccess.model.enumtype.EventSeverity;
import com.smartaccess.repository.AccessLogRepository;
import com.smartaccess.repository.DeviceRepository;
import com.smartaccess.repository.EventRepository;
import com.smartaccess.repository.TelemetryRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;
import java.time.LocalDateTime;
import java.util.*;
import java.util.Optional;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AlertRuleServiceTest {
    final DeviceRepository devices = mock(DeviceRepository.class);
    final EventRepository events = mock(EventRepository.class);
    final TelemetryRepository telemetry = mock(TelemetryRepository.class);
    final AccessLogRepository accessLogs = mock(AccessLogRepository.class);
    final ApplicationEventPublisher notifications = mock(ApplicationEventPublisher.class);
    final AlertRuleService service = new AlertRuleService(devices, events, telemetry, accessLogs, notifications);
    final LocalDateTime now = LocalDateTime.of(2026, 11, 5, 20, 0, 0);
    Device door;

    @BeforeEach void setup() {
        AccessUnit unit = new AccessUnit(); unit.setUnitId(10L); unit.setDoorOpenTimeoutSec((short) 60);
        door = new Device(); door.setDeviceId(7L); door.setDeviceUid("door-1"); door.setDeviceName("Cửa chính");
        door.setDeviceType(DeviceType.DOOR_CONTROLLER); door.setLifecycleStatus(DeviceLifecycleStatus.ACTIVE);
        door.setAccessUnit(unit); door.setLastSeenAt(now.minusSeconds(10));
        when(devices.findByDeviceTypeAndLifecycleStatusAndAccessUnitIsNotNull(DeviceType.DOOR_CONTROLLER,
                DeviceLifecycleStatus.ACTIVE)).thenReturn(List.of(door));
        when(events.findFirstByDevice_DeviceIdAndEventTypeAndAlertStatusIn(anyLong(), anyString(), anyCollection()))
                .thenReturn(Optional.empty());
        when(telemetry.findFirstByDevice_DeviceIdAndMetricNameOrderByOccurredAtDesc(anyLong(), anyString()))
                .thenReturn(Optional.empty());
    }

    Telemetry row(String value, int secondsAgo) {
        Telemetry t = new Telemetry(); t.setMetricName("doorClosed"); t.setMetricValue(value);
        t.setOccurredAt(now.minusSeconds(secondsAgo)); return t;
    }

    /** Cửa mở từ openedSecondsAgo; bản ghi mới nhất (keepalive) vẫn là "false" nhưng gần đây hơn. */
    void doorOpenSince(int openedSecondsAgo) {
        when(telemetry.findFirstByDevice_DeviceIdAndMetricNameOrderByOccurredAtDesc(7L, "doorClosed"))
                .thenReturn(Optional.of(row("false", 5)));
        when(telemetry.findFirstByDevice_DeviceIdAndMetricNameAndMetricValueNotOrderByOccurredAtDesc(7L, "doorClosed", "false"))
                .thenReturn(Optional.of(row("true", openedSecondsAgo + 5)));
        when(telemetry.findFirstByDevice_DeviceIdAndMetricNameAndMetricValueAndOccurredAtAfterOrderByOccurredAtAsc(
                eq(7L), eq("doorClosed"), eq("false"), any())).thenReturn(Optional.of(row("false", openedSecondsAgo)));
    }

    Event created() {
        var captor = ArgumentCaptor.forClass(Event.class);
        verify(events).save(captor.capture());
        return captor.getValue();
    }

    Event active(String type) {
        Event e = new Event(); e.setEventType(type); e.setDevice(door); e.setAlertStatus(AlertStatus.OPEN);
        when(events.findFirstByDevice_DeviceIdAndEventTypeAndAlertStatusIn(eq(7L), eq(type), anyCollection()))
                .thenReturn(Optional.of(e));
        return e;
    }

    @Test void onlineClosedDoorRaisesNothing() {
        assertThat(service.evaluate(now)).isZero();
        verify(events, never()).save(any());
    }

    @Test void offlineControllerRaisesWarning() {
        door.setLastSeenAt(now.minusSeconds(301));
        assertThat(service.evaluate(now)).isEqualTo(1);
        Event alert = created();
        assertThat(alert.getEventType()).isEqualTo("DEVICE_OFFLINE");
        assertThat(alert.getSeverity()).isEqualTo(EventSeverity.WARNING);
        assertThat(alert.getAlertStatus()).isEqualTo(AlertStatus.OPEN);
        assertThat(alert.getDevice()).isSameAs(door);
        assertThat(alert.getEventUuid()).hasSize(36);
        assertThat(alert.getMessage()).contains("Cửa chính").hasSizeLessThanOrEqualTo(255);
        verify(notifications).publishEvent(any(Object.class));
    }

    @Test void neverConnectedControllerIsNotReportedOffline() {
        door.setLastSeenAt(null);
        assertThat(service.evaluate(now)).isZero();
    }
    @Test void pinFailuresBeforeOwnerResponseCannotImmediatelyReopenTheAlert(){
        LocalDateTime handled=now.minusSeconds(20);
        when(events.latestPinResponseAt(7L)).thenReturn(Optional.of(handled));
        service.evaluate(now);
        assertThat(askedAfter.get(Set.of(AccessMethod.PIN))).isEqualTo(handled);
    }

    @Test void openAlertIsNotDuplicated() {
        door.setLastSeenAt(now.minusSeconds(600));
        active("DEVICE_OFFLINE");
        assertThat(service.evaluate(now)).isZero();
        verify(events, never()).save(any());
    }

    @Test void recoveredDeviceResolvesOfflineAlert() {
        Event alert = active("DEVICE_OFFLINE");
        service.evaluate(now);
        assertThat(alert.getAlertStatus()).isEqualTo(AlertStatus.RESOLVED);
    }

    @Test void doorLeftOpenUsesUnitTimeoutFromWhenItOpened() {
        doorOpenSince(59);
        assertThat(service.evaluate(now)).isZero();
        doorOpenSince(61);
        assertThat(service.evaluate(now)).isEqualTo(1);
        Event alert = created();
        assertThat(alert.getEventType()).isEqualTo("DOOR_LEFT_OPEN");
        assertThat(alert.getSeverity()).isEqualTo(EventSeverity.CRITICAL);
    }

    @Test void closedDoorResolvesDoorAlert() {
        Event alert = active("DOOR_LEFT_OPEN");
        when(telemetry.findFirstByDevice_DeviceIdAndMetricNameOrderByOccurredAtDesc(7L, "doorClosed"))
                .thenReturn(Optional.of(row("true", 3)));
        service.evaluate(now);
        assertThat(alert.getAlertStatus()).isEqualTo(AlertStatus.RESOLVED);
    }

    @Test void offlineDoorDoesNotRaiseStaleDoorOpenAlert() {
        door.setLastSeenAt(now.minusSeconds(400));
        doorOpenSince(3600);
        service.evaluate(now);
        assertThat(created().getEventType()).isEqualTo("DEVICE_OFFLINE");
    }

    /** Lượt bị từ chối của cửa 10; stub trả các lượt có phương thức nằm trong danh sách được hỏi. */
    final List<AccessLog> deniedLogs = new ArrayList<>();
    final Map<Set<AccessMethod>, LocalDateTime> askedAfter = new HashMap<>();

    @BeforeEach void stubDeniedLogs() {
        when(accessLogs.findByAccessUnit_UnitIdAndMethodInAndResultAndOccurredAtAfter(
                eq(10L), anyCollection(), eq(AccessResult.DENIED), any())).thenAnswer(call -> {
            Collection<AccessMethod> methods = call.getArgument(1);
            askedAfter.put(Set.copyOf(methods), call.getArgument(3));
            return deniedLogs.stream().filter(l -> methods.contains(l.getMethod())).toList();
        });
    }

    void attempts(AccessMethod method, String reason, int count) {
        for (int i = 0; i < count; i++) {
            AccessLog log = new AccessLog(); log.setMethod(method); log.setResult(AccessResult.DENIED);
            log.setReasonCode(reason); log.setOccurredAt(now.minusSeconds(10 + i)); deniedLogs.add(log);
        }
    }

    Event createdOfType(String type) {
        var captor = ArgumentCaptor.forClass(Event.class);
        verify(events, atLeastOnce()).save(captor.capture());
        return captor.getAllValues().stream().filter(e -> type.equals(e.getEventType())).findFirst().orElse(null);
    }

    @Test void fourWrongPinsRaiseNothingFiveRaiseCritical() {
        attempts(AccessMethod.PIN, "LOCAL_ACCESS_DENIED", 4);
        assertThat(service.evaluate(now)).isZero();
        attempts(AccessMethod.PIN, "LOCAL_ACCESS_DENIED", 1);
        assertThat(service.evaluate(now)).isEqualTo(1);
        Event e = created();
        assertThat(e.getEventType()).isEqualTo(AlertRuleService.REPEATED_WRONG_PIN);
        assertThat(e.getSeverity()).isEqualTo(EventSeverity.CRITICAL);
        assertThat(e.getMessage()).isEqualTo("Cửa Cửa chính: nhập sai PIN 5 lần trong 5 phút, nghi có người dò mã");
    }
    @Test void perDoorPinLimitMatchesTheConfiguredThreshold() {
        door.getAccessUnit().setPinFailureLimit((short)3);
        attempts(AccessMethod.PIN,"LOCAL_ACCESS_DENIED",2);
        assertThat(service.evaluate(now)).isZero();
        attempts(AccessMethod.PIN,"LOCAL_ACCESS_DENIED",1);
        assertThat(service.evaluate(now)).isEqualTo(1);
        assertThat(created().getEventType()).isEqualTo(AlertRuleService.REPEATED_WRONG_PIN);
    }
    @Test void raisingPinLimitDoesNotAlertAtTheOldDefault() {
        door.getAccessUnit().setPinFailureLimit((short)10);
        attempts(AccessMethod.PIN,"LOCAL_ACCESS_DENIED",5);
        assertThat(service.evaluate(now)).isZero();
        verify(events,never()).save(any());
    }

    @Test void lockdownRefusalsAreNotFailedAuthentication() {
        attempts(AccessMethod.RFID, "LOCAL_ACCESS_DENIED,LOCKDOWN", 5);
        attempts(AccessMethod.FACE, "LOCKDOWN", 5);
        assertThat(service.evaluate(now)).isZero();
    }

    @Test void mixedAuthFailuresRaiseOneCriticalWithBreakdown() {
        attempts(AccessMethod.FINGERPRINT, "LOCAL_ACCESS_DENIED", 2);
        attempts(AccessMethod.RFID, "LOCAL_ACCESS_DENIED", 3);
        assertThat(service.evaluate(now)).isEqualTo(1);
        Event e = created();
        assertThat(e.getEventType()).isEqualTo(AlertRuleService.REPEATED_AUTH_FAILED);
        assertThat(e.getSeverity()).isEqualTo(EventSeverity.CRITICAL);
        assertThat(e.getMessage()).isEqualTo("Cửa Cửa chính: xác thực sai 5 lần trong 2 phút (vân tay 2, thẻ 3)");
    }
    @Test void alertParticipantsComeOnlyFromIdentifiedContributingAttempts() {
        attempts(AccessMethod.RFID, "LOCAL_ACCESS_DENIED", 3);
        attempts(AccessMethod.FACE, "UNKNOWN_FACE", 2);
        var user = new com.smartaccess.model.Account(); user.setAccountId(12L);
        deniedLogs.get(0).setAccount(user); deniedLogs.get(1).setAccount(user);
        service.evaluate(now);
        assertThat(createdOfType(AlertRuleService.REPEATED_AUTH_FAILED).getRelatedAccounts()).containsExactly(user);
    }

    @Test void faceFailuresAreListedLast() {
        attempts(AccessMethod.FACE, "UNKNOWN_FACE", 4);
        attempts(AccessMethod.RFID, "LOCAL_ACCESS_DENIED", 1);
        service.evaluate(now);
        assertThat(created().getMessage()).endsWith("(thẻ 1, khuôn mặt 4)");
    }

    @Test void wrongPinsDoNotCountAsAuthFailures() {
        attempts(AccessMethod.PIN, "LOCAL_ACCESS_DENIED", 5);
        assertThat(service.evaluate(now)).isEqualTo(1);
        assertThat(createdOfType(AlertRuleService.REPEATED_WRONG_PIN)).isNotNull();
        assertThat(createdOfType(AlertRuleService.REPEATED_AUTH_FAILED)).isNull();
    }

    @Test void systemReasonsAreNotCountedAsAttempts() {
        attempts(AccessMethod.FACE, "DOOR_BUSY", 3);
        attempts(AccessMethod.FACE, "LOCAL_ACCESS_DENIED,FACE_DISABLED", 1);
        attempts(AccessMethod.FACE, "MODEL_MISMATCH", 1);
        attempts(AccessMethod.FACE, "UNKNOWN_FACE", 4);
        assertThat(service.evaluate(now)).isZero();
    }

    @Test void windowStartsAtWindowWhenNoEarlierAlert() {
        service.evaluate(now);
        assertThat(askedAfter.get(Set.of(AccessMethod.PIN))).isEqualTo(now.minusSeconds(300));
        assertThat(askedAfter.get(Set.of(AccessMethod.FINGERPRINT, AccessMethod.RFID, AccessMethod.FACE)))
                .isEqualTo(now.minusSeconds(120));
    }

    @Test void resolvedAlertIsNotRecreatedFromSameAttempts() {
        Event resolved = new Event(); resolved.setEventType(AlertRuleService.REPEATED_WRONG_PIN);
        resolved.setAlertStatus(AlertStatus.RESOLVED); resolved.setOccurredAt(now.minusSeconds(60));
        when(events.findFirstByDevice_DeviceIdAndEventTypeOrderByOccurredAtDesc(7L, AlertRuleService.REPEATED_WRONG_PIN))
                .thenReturn(Optional.of(resolved));
        service.evaluate(now);
        assertThat(askedAfter.get(Set.of(AccessMethod.PIN))).isEqualTo(now.minusSeconds(60));
    }

    @Test void oldAlertOutsideWindowDoesNotWidenIt() {
        Event old = new Event(); old.setEventType(AlertRuleService.REPEATED_AUTH_FAILED);
        old.setAlertStatus(AlertStatus.RESOLVED); old.setOccurredAt(now.minusSeconds(3600));
        when(events.findFirstByDevice_DeviceIdAndEventTypeOrderByOccurredAtDesc(7L, AlertRuleService.REPEATED_AUTH_FAILED))
                .thenReturn(Optional.of(old));
        service.evaluate(now);
        assertThat(askedAfter.get(Set.of(AccessMethod.FINGERPRINT, AccessMethod.RFID, AccessMethod.FACE)))
                .isEqualTo(now.minusSeconds(120));
    }

    @Test void openWrongPinAlertIsNotDuplicated() {
        active(AlertRuleService.REPEATED_WRONG_PIN);
        active(AlertRuleService.REPEATED_AUTH_FAILED);
        attempts(AccessMethod.PIN, "LOCAL_ACCESS_DENIED", 6);
        attempts(AccessMethod.RFID, "LOCAL_ACCESS_DENIED", 6);
        assertThat(service.evaluate(now)).isZero();
        verify(events, never()).save(any());
    }

    @Test void repeatedWrongPinIsNotAutoResolved() {
        Event open = active(AlertRuleService.REPEATED_WRONG_PIN);
        service.evaluate(now);
        assertThat(open.getAlertStatus()).isEqualTo(AlertStatus.OPEN);
    }

    Telemetry finger(String value, int secondsAgo) {
        Telemetry t = new Telemetry(); t.setMetricName("fingerReady"); t.setMetricValue(value);
        t.setOccurredAt(now.minusSeconds(secondsAgo)); return t;
    }

    @Test void sensorNotReadyForLongRaisesWarningButShortFlickerDoesNot() {
        when(telemetry.findFirstByDevice_DeviceIdAndMetricNameOrderByOccurredAtDesc(7L, "fingerReady"))
                .thenReturn(Optional.of(finger("false", 20)));
        assertThat(service.evaluate(now)).isZero();
        when(telemetry.findFirstByDevice_DeviceIdAndMetricNameOrderByOccurredAtDesc(7L, "fingerReady"))
                .thenReturn(Optional.of(finger("false", 90)));
        assertThat(service.evaluate(now)).isEqualTo(1);
        assertThat(created().getEventType()).isEqualTo(AlertRuleService.SENSOR_FAULT);
    }

    @Test void sensorBackResolvesFault() {
        Event open = active(AlertRuleService.SENSOR_FAULT);
        when(telemetry.findFirstByDevice_DeviceIdAndMetricNameOrderByOccurredAtDesc(7L, "fingerReady"))
                .thenReturn(Optional.of(finger("true", 5)));
        service.evaluate(now);
        assertThat(open.getAlertStatus()).isEqualTo(AlertStatus.RESOLVED);
    }
}
