package com.smartaccess.service;

import com.smartaccess.model.*;
import com.smartaccess.model.enumtype.DeviceLifecycleStatus;
import com.smartaccess.repository.DeviceRepository;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.server.ResponseStatusException;
import java.util.Optional;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class DeviceAuthenticationServiceTest {
    @Test
    void credentialsAreDeviceSpecificAndDisabledDevicesCannotAuthenticate() {
        DeviceRepository devices = mock(DeviceRepository.class);
        var passwords = new BCryptPasswordEncoder(4);
        var service = new DeviceAuthenticationService(devices, passwords);
        Device d = new Device(); d.setDeviceUid("camera"); d.setAccessUnit(new AccessUnit());
        String secret = "unique-camera-secret-12345678";
        d.setDeviceSecretHash(passwords.encode(secret));
        when(devices.findByDeviceUid("camera")).thenReturn(Optional.of(d));
        assertThat(service.authenticate("camera", secret)).isSameAs(d);
        assertThatThrownBy(() -> service.authenticate("camera", "wrong-camera-secret-12345678")).isInstanceOf(ResponseStatusException.class);
        for (DeviceLifecycleStatus state : new DeviceLifecycleStatus[]{DeviceLifecycleStatus.SUSPENDED,
                DeviceLifecycleStatus.DECOMMISSIONED, DeviceLifecycleStatus.MAINTENANCE}) {
            d.setLifecycleStatus(state);
            assertThatThrownBy(() -> service.authenticate("camera", secret)).isInstanceOf(ResponseStatusException.class);
        }
    }
}
