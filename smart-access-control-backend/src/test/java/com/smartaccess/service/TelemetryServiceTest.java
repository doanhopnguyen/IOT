package com.smartaccess.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.smartaccess.model.Device;
import com.smartaccess.model.Telemetry;
import com.smartaccess.repository.TelemetryRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class TelemetryServiceTest {
    final TelemetryRepository repository = mock(TelemetryRepository.class);
    final com.smartaccess.repository.DeviceRepository devices = mock(com.smartaccess.repository.DeviceRepository.class);
    final TelemetryService service = new TelemetryService(repository, devices);
    final ObjectMapper json = new ObjectMapper();
    Device door;
    String requestId;

    @BeforeEach void setup() {
        door = new Device(); door.setDeviceId(7L); door.setDeviceUid("door-1");
        requestId = UUID.randomUUID().toString();
        when(devices.findById(7L)).thenReturn(Optional.of(door));
        when(repository.findFirstByDevice_DeviceIdAndMetricNameOrderByOccurredAtDesc(anyLong(), anyString()))
                .thenReturn(Optional.empty());
    }

    List<Telemetry> saved() {
        var captor = ArgumentCaptor.forClass(Telemetry.class);
        verify(repository, atLeast(0)).save(captor.capture());
        return captor.getAllValues();
    }

    Telemetry saved(String metric) {
        return saved().stream().filter(t -> t.getMetricName().equals(metric)).findFirst().orElse(null);
    }

    void last(String metric, String value, int secondsAgo) {
        Telemetry previous = new Telemetry(); previous.setMetricName(metric); previous.setMetricValue(value);
        previous.setOccurredAt(LocalDateTime.now().minusSeconds(secondsAgo));
        when(repository.findFirstByDevice_DeviceIdAndMetricNameOrderByOccurredAtDesc(7L, metric))
                .thenReturn(Optional.of(previous));
    }

    ObjectNode status() { return json.createObjectNode(); }

    @Test void storesEachKnownMetricWithUnitOnFirstHeartbeat() {
        service.record(door, status().put("doorClosed", true).put("unlocked", false).put("rssi", -61)
                .put("freeHeap", 180000).put("deviceSecret", "never-stored"), requestId);
        assertThat(saved()).extracting(Telemetry::getMetricName)
                .containsExactlyInAnyOrder("doorClosed", "unlocked", "rssi", "freeHeap");
        Telemetry rssi = saved("rssi");
        assertThat(rssi.getMetricValue()).isEqualTo("-61");
        assertThat(rssi.getMeasurementUnit()).isEqualTo("dBm");
        assertThat(rssi.getDevice()).isSameAs(door);
        assertThat(rssi.getOccurredAt()).isAfter(LocalDateTime.now().minusMinutes(1));
    }

    @Test void storesGuidedSetupProgressButNeverPinOrWifiPassword() {
        service.record(door,status().put("setupStage","TOUCH_3").put("wifiSsid","Home 2.4")
                .put("hasDoorPin",true).put("adminPinSet",true).put("touchCalibrated",false).put("doorCalibrated",false)
                .put("pin","123456").put("adminPin","654321").put("wifiPassword","private").putNull("unlocked"),requestId);
        assertThat(saved()).extracting(Telemetry::getMetricName).containsExactlyInAnyOrder(
                "setupStage","wifiSsid","hasDoorPin","adminPinSet","touchCalibrated","doorCalibrated","unlocked");
        assertThat(saved("setupStage").getMetricValue()).isEqualTo("TOUCH_3");
        assertThat(saved("unlocked").getMetricValue()).isEqualTo("unknown");
    }
    @Test void rejectsMalformedSetupStageAndOverlongNetworkName() {
        service.record(door,status().put("setupStage","<bad>").put("wifiSsid","x".repeat(33)).put("adminPinSet","true"),requestId);
        assertThat(saved()).isEmpty();
    }
    @Test void servoAnglesMayBeEqualButMustStayWithinRange() {
        service.record(door,status().put("lockAngle",90).put("openAngle",90),requestId);
        assertThat(saved("lockAngle").getMetricValue()).isEqualTo("90");
        assertThat(saved("openAngle").getMeasurementUnit()).isEqualTo("deg");
    }
    @Test void servoCalibrationReportsCommandsAndDirectionWithoutClaimingPositionFeedback() {
        service.record(door,status().put("setupStage","SERVO_OPEN").put("servoCalibrated",false)
                .put("servoCommandAngle",100).put("servoDirection","DECREASE"),requestId);
        assertThat(saved("setupStage").getMetricValue()).isEqualTo("SERVO_OPEN");
        assertThat(saved("servoCommandAngle").getMetricValue()).isEqualTo("100");
        assertThat(saved("servoDirection").getMetricValue()).isEqualTo("DECREASE");
        assertThat(saved("servoCalibrated").getMetricValue()).isEqualTo("false");
    }
    @Test void missingServoPositionRemainsUnknown() {
        service.record(door,status().putNull("servoCommandAngle").put("servoDirection","UNKNOWN"),requestId);
        assertThat(saved("servoCommandAngle").getMetricValue()).isEqualTo("unknown");
    }
    @Test void unchangedValuesAreNotStoredAgainWithinKeepalive() {
        last("doorClosed", "true", 60);
        service.record(door, status().put("doorClosed", true), requestId);
        assertThat(saved()).isEmpty();
        last("doorClosed", "true", 301);
        service.record(door, status().put("doorClosed", true), UUID.randomUUID().toString());
        assertThat(saved("doorClosed")).isNotNull();
    }

    @Test void changedValueIsStoredImmediately() {
        last("doorClosed", "true", 5);
        service.record(door, status().put("doorClosed", false), requestId);
        assertThat(saved("doorClosed").getMetricValue()).isEqualTo("false");
    }

    @Test void rssiSmallChangeIsIgnored() {
        last("rssi", "-61", 10);
        service.record(door, status().put("rssi", -63), requestId);
        assertThat(saved()).isEmpty();
        service.record(door, status().put("rssi", -67), UUID.randomUUID().toString());
        assertThat(saved("rssi").getMetricValue()).isEqualTo("-67");
    }

    @Test void nullDoorClosedIsStoredAsUnknown() {
        service.record(door, status().putNull("doorClosed"), requestId);
        assertThat(saved("doorClosed").getMetricValue()).isEqualTo("unknown");
    }

    @Test void outOfRangeOrWrongTypeValuesAreSkipped() {
        service.record(door, status().put("rssi", 20).put("freeHeap", -1).put("uptime", "abc")
                .put("unlocked", "yes"), requestId);
        assertThat(saved()).isEmpty();
        service.record(door, status().put("rssi", -200), UUID.randomUUID().toString());
        assertThat(saved()).isEmpty();
    }

    @Test void firmwareAndHardwareVersionAreCopiedToDevice() {
        service.record(door, status().put("fw", "1.1.0").put("hw", "esp32s3-n16r8"), requestId);
        assertThat(door.getFirmwareVersion()).isEqualTo("1.1.0");
        assertThat(door.getHardwareVersion()).isEqualTo("esp32s3-n16r8");
        service.record(door, status().put("fw", "x".repeat(51)), UUID.randomUUID().toString());
        assertThat(door.getFirmwareVersion()).isEqualTo("1.1.0");
    }

    @Test void messageUuidIsDeterministicPerRequestAndMetric() {
        service.record(door, status().put("rssi", -50), requestId);
        String first = saved("rssi").getMessageUuid();
        assertThat(first).isEqualTo(TelemetryService.messageUuid(requestId, "rssi"));
        assertThat(first).hasSize(36).isNotEqualTo(TelemetryService.messageUuid(requestId, "uptime"));
    }

    @Test void duplicateMessageIsNotStoredTwice() {
        when(repository.existsByMessageUuid(TelemetryService.messageUuid(requestId, "rssi"))).thenReturn(true);
        service.record(door, status().put("rssi", -50), requestId);
        assertThat(saved()).isEmpty();
    }
}
