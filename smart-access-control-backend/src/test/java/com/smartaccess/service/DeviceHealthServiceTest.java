package com.smartaccess.service;
import com.smartaccess.model.Device;
import com.smartaccess.model.enumtype.DeviceType;
import com.smartaccess.repository.DeviceRepository;
import org.junit.jupiter.api.Test;
import java.time.LocalDateTime;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class DeviceHealthServiceTest {
    final ManagerAccessGuard guard=mock(ManagerAccessGuard.class);
    final DeviceRepository devices=mock(DeviceRepository.class);
    final TelemetryService telemetry=mock(TelemetryService.class);
    final DeviceHealthService service=new DeviceHealthService(guard,devices,telemetry);
    @Test void staleHeartbeatOrStaleSnapshotCannotReportWorkingModulesAndSecretsAreNeverReturned() {
        var device=new Device();device.setDeviceId(7L);device.setLastSeenAt(LocalDateTime.now());
        when(devices.findFirstByAccessUnit_UnitIdAndDeviceType(3L,DeviceType.DOOR_CONTROLLER)).thenReturn(Optional.of(device));
        when(telemetry.latest(7L)).thenReturn(new TelemetryService.Snapshot(LocalDateTime.now(),Map.of(
                "fingerReady","true","rfidReady","false","deviceSecret","secret","wifiPassword","secret")));
        assertThat(service.get(1L,3L).metrics()).containsOnlyKeys("fingerReady","rfidReady");
        device.setLastSeenAt(LocalDateTime.now().minusSeconds(91));
        assertThat(service.get(1L,3L).online()).isFalse();assertThat(service.get(1L,3L).metrics()).isEmpty();
        device.setLastSeenAt(LocalDateTime.now());
        when(telemetry.latest(7L)).thenReturn(new TelemetryService.Snapshot(LocalDateTime.now().minusSeconds(91),Map.of("rfidReady","true")));
        assertThat(service.get(1L,3L).metrics()).isEmpty();
        when(telemetry.latest(7L)).thenReturn(null);
        assertThat(service.get(1L,3L).updatedAt()).isNull();
        verify(guard,atLeastOnce()).requireManagedUnit(1L,3L);
    }
}
