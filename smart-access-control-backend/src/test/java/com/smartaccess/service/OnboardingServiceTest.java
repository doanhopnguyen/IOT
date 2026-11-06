package com.smartaccess.service;

import com.smartaccess.model.*;
import com.smartaccess.model.enumtype.*;
import com.smartaccess.repository.*;
import org.junit.jupiter.api.*;
import org.springframework.security.crypto.password.PasswordEncoder;
import java.time.LocalDateTime;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class OnboardingServiceTest {
    final ManagerAccessGuard guard=mock(ManagerAccessGuard.class);
    final DeviceRepository devices=mock(DeviceRepository.class);
    final DeviceInventoryRepository inventory=mock(DeviceInventoryRepository.class);
    final TelemetryRepository telemetry=mock(TelemetryRepository.class);
    final DeviceCommandService commands=mock(DeviceCommandService.class);
    final PasswordEncoder passwords=mock(PasswordEncoder.class);
    final OnboardingService service=new OnboardingService(guard,devices,inventory,telemetry,commands,passwords);
    Device device; Map<String,Object> saved,wire;
    @BeforeEach void setup(){
        device=new Device();device.setDeviceId(3L);device.setDeviceUid("ESP32-AABBCCDDEEFF");
        device.setLifecycleStatus(DeviceLifecycleStatus.ACTIVE);device.setLastSeenAt(LocalDateTime.now());
        when(guard.requireOnlineController(7L)).thenReturn(device);
        when(devices.findFirstByAccessUnit_UnitIdAndDeviceType(7L,DeviceType.DOOR_CONTROLLER)).thenReturn(Optional.of(device));
        when(telemetry.findFirstByDevice_DeviceIdAndMetricNameOrderByOccurredAtDesc(anyLong(),anyString())).thenReturn(Optional.empty());
        when(passwords.encode(anyString())).thenAnswer(i->"hash:"+i.getArgument(0));
        when(commands.dispatch(any(),anyLong(),anyString(),anyMap(),anyMap())).thenAnswer(i->{
            saved=i.getArgument(3);wire=i.getArgument(4);Command c=new Command();c.setCommandUuid(UUID.randomUUID().toString());c.setStatus(CommandStatus.SENT);return c;
        });
    }
    @Test void pinsAreNotPersistedInPlainTextAndWaitForDeviceAck(){
        assertThat(service.credentials(2L,7L,"123456","123456","654321","654321").status()).isEqualTo(CommandStatus.SENT);
        verify(guard).requireManagedUnit(2L,7L);verify(guard).requireOnlineController(7L);
        assertThat(saved).containsEntry("pinHash","hash:123456").containsEntry("adminPinHash","hash:654321").doesNotContainKeys("pin","adminPin");
        assertThat(wire).containsEntry("pin","123456").containsEntry("adminPin","654321");
    }
    @Test void rejectsSamePinsAndMismatchedConfirmationBeforeSending(){
        assertThatThrownBy(()->service.credentials(2L,7L,"123456","123456","123456","123456")).isInstanceOf(RuntimeException.class);
        assertThatThrownBy(()->service.credentials(2L,7L,"123456","111111","654321","654321")).isInstanceOf(RuntimeException.class);
        verifyNoInteractions(commands);
    }
    @Test void nonOwnerCannotStartWifiOrCalibration(){
        doThrow(new IllegalStateException("forbidden")).when(guard).requireManagedUnit(9L,7L);
        assertThatThrownBy(()->service.wifi(9L,7L)).hasMessage("forbidden");
        assertThatThrownBy(()->service.calibrate(9L,7L)).hasMessage("forbidden");
        verifyNoInteractions(commands);
    }
    @Test void offlineDoorRejectsAllSetupCommands(){
        when(guard.requireOnlineController(7L)).thenThrow(new IllegalStateException("offline"));
        assertThatThrownBy(()->service.credentials(2L,7L,"123456","123456","654321","654321")).hasMessage("offline");
        assertThatThrownBy(()->service.wifi(2L,7L)).hasMessage("offline");
        assertThatThrownBy(()->service.calibrate(2L,7L)).hasMessage("offline");
        verifyNoInteractions(commands);
    }
    @Test void reportsCalibrationStageWithoutTreatingItAsReady(){
        Telemetry point=new Telemetry();point.setMetricValue("TOUCH_3");
        when(telemetry.findFirstByDevice_DeviceIdAndMetricNameOrderByOccurredAtDesc(3L,"setupStage")).thenReturn(Optional.of(point));
        var status=service.status(2L,7L);assertThat(status.online()).isTrue();assertThat(status.stage()).isEqualTo("TOUCH_3");assertThat(status.ready()).isFalse();
        device.setLastSeenAt(LocalDateTime.now().minusSeconds(100));assertThat(service.status(2L,7L).online()).isFalse();
    }
    @Test void servoAllowsEqualAnglesAndDispatchesOnlySaveCommand(){
        assertThat(service.setServoAngles(2L,7L,100,100).status()).isEqualTo(CommandStatus.SENT);
        assertThat(saved).containsEntry("lockAngle",100).containsEntry("openAngle",100);
        assertThat(wire).containsExactlyInAnyOrderEntriesOf(Map.of("lockAngle",100,"openAngle",100));
        verify(commands).dispatch(eq(device),eq(2L),eq(OnboardingService.SERVO_SET),anyMap(),anyMap());
        verify(guard).requireManagedUnit(2L,7L);
    }
    @Test void servoRejectsOutOfRangeAndMissingAngles(){
        assertThatThrownBy(()->service.setServoAngles(2L,7L,4,100)).isInstanceOf(RuntimeException.class);
        assertThatThrownBy(()->service.setServoAngles(2L,7L,100,176)).isInstanceOf(RuntimeException.class);
        assertThatThrownBy(()->service.setServoAngles(2L,7L,null,100)).isInstanceOf(RuntimeException.class);
        verifyNoInteractions(commands);
    }
    @Test void servoRequiresOwnerAndOnlineController(){
        doThrow(new IllegalStateException("forbidden")).when(guard).requireManagedUnit(9L,7L);
        assertThatThrownBy(()->service.setServoAngles(9L,7L,90,90)).hasMessage("forbidden");
        when(guard.requireOnlineController(7L)).thenThrow(new IllegalStateException("offline"));
        assertThatThrownBy(()->service.setServoAngles(2L,7L,90,90)).hasMessage("offline");
        verifyNoInteractions(commands);
    }
    @Test void servoReportsActualTelemetryWithoutInventingDefaults(){
        assertThat(service.servoAngles(2L,7L)).isEqualTo(new OnboardingService.ServoAngles(null,null));
        Telemetry angle=new Telemetry();angle.setMetricValue("90");
        when(telemetry.findFirstByDevice_DeviceIdAndMetricNameOrderByOccurredAtDesc(eq(3L),argThat(name->name.equals("lockAngle")||name.equals("openAngle")))).thenReturn(Optional.of(angle));
        assertThat(service.servoAngles(2L,7L)).isEqualTo(new OnboardingService.ServoAngles(90,90));
    }
}
