package com.smartaccess.controller;

import com.smartaccess.model.*;
import com.smartaccess.model.enumtype.*;
import com.smartaccess.repository.*;
import com.smartaccess.security.AccountPrincipal;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class AdminDeviceControllerTest {
    final DeviceRepository devices = mock(DeviceRepository.class);
    final AccountRepository accounts = mock(AccountRepository.class);
    final AuditLogRepository audits = mock(AuditLogRepository.class);
    final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
    final com.smartaccess.service.DecommissionNotifier notifier = mock(com.smartaccess.service.DecommissionNotifier.class);
    final com.smartaccess.service.BrokerAccounts brokers = mock(com.smartaccess.service.BrokerAccounts.class);
    final AdminDeviceController controller = new AdminDeviceController(devices, accounts, audits, encoder, notifier, brokers);

    @Test void decommissionNotifiesDeviceOnlyForDecommission() {
        Device d = new Device(); d.setDeviceUid("door-1"); d.setDeviceSecretHash(encoder.encode("old-secret"));
        when(devices.findByDeviceUidForUpdate("door-1")).thenReturn(Optional.of(d));
        controller.lifecycle(actor, "door-1", new AdminDeviceController.Lifecycle(DeviceLifecycleStatus.SUSPENDED));
        verifyNoInteractions(notifier, brokers);
        controller.lifecycle(actor, "door-1", new AdminDeviceController.Lifecycle(DeviceLifecycleStatus.DECOMMISSIONED));
        verify(notifier).notifyNow("door-1");
        verify(brokers).disableDevice("door-1");
        assertThat(d.getDeviceSecretHash()).isNull();
    }
    final AccountPrincipal actor = new AccountPrincipal(1L);

    @Test void registrationReturnsOneTimeSecretAndStoresOnlyBcrypt() {
        when(devices.saveAndFlush(any())).thenAnswer(invocation -> {
            Device d = invocation.getArgument(0); d.setDeviceId(2L); return d;
        });
        var result = controller.register(actor, new AdminDeviceController.Register("door-1", "Door", DeviceType.DOOR_CONTROLLER));
        var captor = org.mockito.ArgumentCaptor.forClass(Device.class); verify(devices).saveAndFlush(captor.capture());
        assertThat(result.deviceSecret()).hasSize(43);
        assertThat(encoder.matches(result.deviceSecret(), captor.getValue().getDeviceSecretHash())).isTrue();
        assertThat(result.device().unitId()).isNull();
        assertThat(result.device().lifecycleStatus()).isEqualTo(DeviceLifecycleStatus.REGISTERED);
        verify(audits).save(any());
    }
    @Test void rotationInvalidatesOldSecretAndDecommissionIsFinal() {
        Device d = new Device(); d.setDeviceUid("door-1"); d.setDeviceSecretHash(encoder.encode("old-secret"));
        when(devices.findByDeviceUidForUpdate("door-1")).thenReturn(Optional.of(d));
        var result = controller.rotate(actor, "door-1");
        assertThat(encoder.matches("old-secret", d.getDeviceSecretHash())).isFalse();
        assertThat(encoder.matches(result.deviceSecret(), d.getDeviceSecretHash())).isTrue();
        controller.lifecycle(actor, "door-1", new AdminDeviceController.Lifecycle(DeviceLifecycleStatus.DECOMMISSIONED));
        assertThat(d.getDeviceSecretHash()).isNull();
        assertThatThrownBy(() -> controller.rotate(actor, "door-1")).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> controller.lifecycle(actor, "door-1", new AdminDeviceController.Lifecycle(DeviceLifecycleStatus.REGISTERED)))
                .isInstanceOf(ResponseStatusException.class);
    }
    @Test void transitionsRequireAnOwnerForActiveAndProvisioned() {
        Device d = new Device(); d.setDeviceUid("door-1");
        when(devices.findByDeviceUidForUpdate("door-1")).thenReturn(Optional.of(d));
        AccessUnit unit = new AccessUnit(); d.setAccessUnit(unit);
        for (var status : List.of(DeviceLifecycleStatus.ACTIVE, DeviceLifecycleStatus.PROVISIONED)) {
            assertThat(com.smartaccess.service.DeviceLifecyclePolicy.allowed(d)).doesNotContain(status);
            assertThatThrownBy(() -> controller.lifecycle(actor, "door-1", new AdminDeviceController.Lifecycle(status)))
                    .isInstanceOf(ResponseStatusException.class);
        }
        unit.setManager(new Account());
        controller.lifecycle(actor, "door-1", new AdminDeviceController.Lifecycle(DeviceLifecycleStatus.PROVISIONED));
        controller.lifecycle(actor, "door-1", new AdminDeviceController.Lifecycle(DeviceLifecycleStatus.ACTIVE));
        controller.lifecycle(actor, "door-1", new AdminDeviceController.Lifecycle(DeviceLifecycleStatus.MAINTENANCE));
        controller.lifecycle(actor, "door-1", new AdminDeviceController.Lifecycle(DeviceLifecycleStatus.SUSPENDED));
        controller.lifecycle(actor, "door-1", new AdminDeviceController.Lifecycle(DeviceLifecycleStatus.DECOMMISSIONED));
        assertThat(com.smartaccess.service.DeviceLifecyclePolicy.allowed(d)).isEmpty();
        assertThat(d.getDeviceSecretHash()).isNull();
    }
}
