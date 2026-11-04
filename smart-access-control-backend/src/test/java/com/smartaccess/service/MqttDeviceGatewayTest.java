package com.smartaccess.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartaccess.model.Device;
import com.smartaccess.model.enumtype.DeviceType;
import org.eclipse.paho.client.mqttv3.MqttMessage;
import org.junit.jupiter.api.Test;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class MqttDeviceGatewayTest {
    final DeviceService devices = mock(DeviceService.class);
    final DeviceAuthenticationService auth = mock(DeviceAuthenticationService.class);
    final CommandAckService acks = mock(CommandAckService.class);
    final AccessEventService events = mock(AccessEventService.class);
    final MqttDeviceGateway gateway = new MqttDeviceGateway("tcp://localhost:1883", "test/doors", new ObjectMapper(),
            devices, acks, events, auth, mock(FaceRecognitionService.class), "", "", mock(LocalAccessPolicyService.class),
            mock(org.springframework.context.ApplicationEventPublisher.class));
    final String body = "{\"commandUuid\":\"cmd-1\",\"success\":true,\"deviceSecret\":\"secret\"}";

    @Test void unauthorizedAckNeverTouchesDeviceOrCommand() {
        when(auth.authenticate(anyString(), anyString())).thenThrow(new IllegalArgumentException());
        gateway.handle("test/doors/door-1/ack", new MqttMessage(body.getBytes()));
        verifyNoInteractions(devices, acks, events);
    }
    @Test void retainedWrongTopicAndWrongDeviceTypeCannotAcknowledge() {
        MqttMessage retained = new MqttMessage(body.getBytes()); retained.setRetained(true);
        gateway.handle("test/doors/door-1/ack", retained);
        gateway.handle("other/doors/door-1/ack", new MqttMessage(body.getBytes()));
        gateway.handle("test/doors/door-1/nested/ack", new MqttMessage(body.getBytes()));
        verifyNoInteractions(auth);
        Device camera = new Device(); camera.setDeviceType(DeviceType.FACE_CAMERA_NODE);
        when(auth.authenticate("door-1", "secret")).thenReturn(camera);
        gateway.handle("test/doors/door-1/ack", new MqttMessage(body.getBytes()));
        verifyNoInteractions(devices, acks, events);
    }
    @Test void authenticatedControllerAckIsRoutedWithNestedPrefix() {
        Device door = new Device(); door.setDeviceType(DeviceType.DOOR_CONTROLLER);
        when(auth.authenticate("door-1", "secret")).thenReturn(door);
        gateway.handle("test/doors/door-1/ack", new MqttMessage(body.getBytes()));
        verify(devices).touch("door-1"); verify(acks).handleAck("door-1", "cmd-1", true, null);
    }
}
