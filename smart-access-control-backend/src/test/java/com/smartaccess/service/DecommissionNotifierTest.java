package com.smartaccess.service;

import com.smartaccess.model.Device;
import com.smartaccess.model.enumtype.DeviceLifecycleStatus;
import com.smartaccess.repository.DeviceRepository;
import org.junit.jupiter.api.Test;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class DecommissionNotifierTest {
    final DeviceRepository devices = mock(DeviceRepository.class);
    final DeviceGateway gateway = mock(DeviceGateway.class);
    final AtomicLong clock = new AtomicLong(1_000_000);
    final DecommissionNotifier notifier = new DecommissionNotifier(devices, gateway, clock::get);

    void device(DeviceLifecycleStatus status) {
        Device d = new Device(); d.setDeviceUid("door-1"); d.setLifecycleStatus(status);
        when(devices.findByDeviceUid("door-1")).thenReturn(Optional.of(d));
    }

    @Test void notifySendsDecommissionCommand() {
        notifier.notifyNow("door-1");
        verify(gateway).send(eq("door-1"), argThat(uuid -> uuid.length() == 36), eq("DEVICE_DECOMMISSION"), eq(Map.of()));
    }

    @Test void sendFailureIsSwallowed() {
        doThrow(new IllegalStateException("offline")).when(gateway).send(anyString(), anyString(), anyString(), anyMap());
        assertThatCode(() -> notifier.notifyNow("door-1")).doesNotThrowAnyException();
    }

    @Test void rateLimitsPerDevice() {
        device(DeviceLifecycleStatus.DECOMMISSIONED);
        notifier.onRejected("door-1");
        clock.addAndGet(59_000);
        notifier.onRejected("door-1");
        verify(gateway, times(1)).send(anyString(), anyString(), anyString(), anyMap());
        clock.addAndGet(2_000);
        notifier.onRejected("door-1");
        verify(gateway, times(2)).send(anyString(), anyString(), anyString(), anyMap());
    }

    @Test void ignoresNonDecommissionedAndUnknown() {
        device(DeviceLifecycleStatus.ACTIVE);
        notifier.onRejected("door-1");
        notifier.onRejected("unknown");
        verifyNoInteractions(gateway);
    }
}
