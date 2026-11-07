package com.smartaccess.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.smartaccess.model.AccessLog;
import com.smartaccess.model.AccessUnit;
import com.smartaccess.model.Credential;
import com.smartaccess.model.Device;
import com.smartaccess.model.enumtype.CredentialStatus;
import com.smartaccess.model.enumtype.CredentialType;
import com.smartaccess.repository.AccessLogRepository;
import com.smartaccess.repository.CredentialRepository;
import com.smartaccess.repository.DeviceRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AccessEventServiceTest {
    final DeviceRepository devices = mock(DeviceRepository.class);
    final CredentialRepository credentials = mock(CredentialRepository.class);
    final AccessLogRepository logs = mock(AccessLogRepository.class);
    final AccessEventService service = new AccessEventService(devices, credentials, logs);
    final ObjectMapper json = new ObjectMapper();
    Device door;

    @BeforeEach void setup() {
        door = new Device(); door.setDeviceId(7L); door.setDeviceUid("door-1");
        AccessUnit unit = new AccessUnit(); unit.setUnitId(10L); door.setAccessUnit(unit);
        when(devices.findByDeviceUidForUpdate("door-1")).thenReturn(Optional.of(door));
        when(logs.findByAccessUuid(anyString())).thenReturn(Optional.empty());
    }

    ObjectNode event(String method, String result, long occurredAt) {
        return json.createObjectNode().put("eventUuid", UUID.randomUUID().toString())
                .put("method", method).put("result", result).put("occurredAt", occurredAt);
    }

    AccessLog saved() {
        var captor = ArgumentCaptor.forClass(AccessLog.class);
        verify(logs).saveAndFlush(captor.capture());
        return captor.getValue();
    }

    @Test void clockAheadIsStoredWithServerTimeInsteadOfRejectedForever() {
        service.recordLocal("door-1", event("PIN", "GRANTED", Instant.now().getEpochSecond() + 3600));
        AccessLog entry = saved();
        assertThat(entry.getReasonCode()).isEqualTo("DEVICE_CLOCK_INVALID");
        assertThat(entry.getOccurredAt()).isBefore(LocalDateTime.now().plusMinutes(1));
    }

    @Test void unsyncedClockIsKeptAlongsideDenialReason() {
        service.recordLocal("door-1", event("PIN", "DENIED", 0));
        assertThat(saved().getReasonCode()).isEqualTo("DEVICE_CLOCK_UNSYNCED,LOCAL_ACCESS_DENIED");
    }

    @Test void syncedGrantHasNoReason() {
        service.recordLocal("door-1", event("PIN", "GRANTED", Instant.now().getEpochSecond()));
        assertThat(saved().getReasonCode()).isNull();
    }

    @Test void fingerprintUsesIndexedTemplateLookup() {
        Credential finger = new Credential(); finger.setCredentialType(CredentialType.FINGERPRINT);
        when(credentials.findFirstByDevice_DeviceIdAndCredentialTypeAndLocalTemplateIdAndStatus(
                7L, CredentialType.FINGERPRINT, (short) 3, CredentialStatus.ACTIVE)).thenReturn(Optional.of(finger));
        service.recordLocal("door-1", event("FINGERPRINT", "GRANTED", Instant.now().getEpochSecond()).put("templateId", 3));
        assertThat(saved().getCredential()).isSameAs(finger);
        verify(credentials, never()).findByDevice_DeviceIdAndCredentialTypeAndStatus(anyLong(), any(), any());
    }

    @Test void unknownMethodIsPermanentlyInvalid() {
        assertThatThrownBy(() -> service.recordLocal("door-1", event("FACE", "GRANTED", 0)))
                .isInstanceOf(IllegalArgumentException.class);
        verify(logs, never()).saveAndFlush(any());
    }

    @Test void lockdownRefusalKeepsItsReason() {
        service.recordLocal("door-1", event("RFID", "DENIED", Instant.now().getEpochSecond()).put("reason", "LOCKDOWN"));
        assertThat(saved().getReasonCode()).isEqualTo("LOCAL_ACCESS_DENIED,LOCKDOWN");
    }

    @Test void unknownDeviceReasonIsIgnored() {
        service.recordLocal("door-1", event("RFID", "DENIED", Instant.now().getEpochSecond()).put("reason", "ANYTHING"));
        assertThat(saved().getReasonCode()).isEqualTo("LOCAL_ACCESS_DENIED");
    }
}
