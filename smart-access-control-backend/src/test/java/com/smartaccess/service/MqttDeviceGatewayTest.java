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
    final LocalAccessPolicyService policies = mock(LocalAccessPolicyService.class);
    final org.springframework.context.ApplicationEventPublisher notifications = mock(org.springframework.context.ApplicationEventPublisher.class);
    final TelemetryService telemetry = mock(TelemetryService.class);
    final MqttDeviceGateway gateway = new MqttDeviceGateway("tcp://localhost:1883", "test/doors", new ObjectMapper(),
            devices, acks, events, auth, mock(FaceRecognitionService.class), "", "", policies, notifications, telemetry);
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
        verify(devices).touch("door-1"); verify(acks).handleAck("door-1", "cmd-1", true, null, null);
    }
    @Test void enrollAckPassesTemplateIdChosenByFirmware() {
        Device door = new Device(); door.setDeviceType(DeviceType.DOOR_CONTROLLER);
        when(auth.authenticate("door-1", "secret")).thenReturn(door);
        String ack = "{\"deviceSecret\":\"secret\",\"commandUuid\":\"cmd-2\",\"success\":true,\"message\":\"ENROLLED\",\"templateId\":5}";
        gateway.handle("test/doors/door-1/ack", new MqttMessage(ack.getBytes()));
        verify(acks).handleAck("door-1", "cmd-2", true, "ENROLLED", 5);
    }

    Device device(DeviceType type) {
        Device device = new Device(); device.setDeviceType(type);
        when(auth.authenticate(anyString(), anyString())).thenReturn(device);
        return device;
    }
    MqttMessage message(String json) { return new MqttMessage(json.getBytes()); }

    @Test void cameraHeartbeatKeepsCameraOnlineWithoutRoutingDoorTopics() {
        device(DeviceType.FACE_CAMERA_NODE);
        gateway.handle("test/doors/cam-1/status", message("{\"deviceSecret\":\"s\",\"schemaVersion\":1}"));
        verify(devices).touch("cam-1");
        verifyNoInteractions(acks, events, policies);
    }

    @Test void permanentlyInvalidAccessEventIsStillAcknowledged() {
        device(DeviceType.DOOR_CONTROLLER);
        doThrow(new IllegalArgumentException("Invalid local method")).when(events).recordLocal(eq("door-1"), any());
        gateway.handle("test/doors/door-1/access", message("{\"deviceSecret\":\"s\",\"eventUuid\":\"e\",\"method\":\"FACE\"}"));
        // Nếu lỗi lọt ra ngoài thì handle() dừng trước khi báo realtime và gửi access-ack.
        verify(notifications).publishEvent(any(com.smartaccess.config.RealtimeConfig.DeviceUpdated.class));
    }

    @Test void staleGenerationNeverReceivesAccessPolicies() throws Exception {
        Device door = device(DeviceType.DOOR_CONTROLLER); door.setAccessUnit(new com.smartaccess.model.AccessUnit());
        DeploymentService deployment = mock(DeploymentService.class);
        when(deployment.wireConfig(eq("door-1"), any())).thenReturn(java.util.Map.of("generation", 2L, "generationMismatch", true));
        var field = MqttDeviceGateway.class.getDeclaredField("deployment"); field.setAccessible(true); field.set(gateway, deployment);
        gateway.handle("test/doors/door-1/status",
                message("{\"deviceSecret\":\"s\",\"generation\":1,\"requestId\":\"" + java.util.UUID.randomUUID() + "\"}"));
        verify(deployment).wireConfig(eq("door-1"), any());
        verify(policies, never()).snapshot(anyString());
        verify(telemetry, never()).record(any(), any(), anyString());
    }

    @Test void statusIsRecordedAsTelemetry() {
        Device door = device(DeviceType.DOOR_CONTROLLER);
        String requestId = java.util.UUID.randomUUID().toString();
        gateway.handle("test/doors/door-1/status",
                message("{\"deviceSecret\":\"s\",\"rssi\":-60,\"requestId\":\"" + requestId + "\"}"));
        verify(telemetry).record(eq(door), argThat(body -> body.path("rssi").asInt() == -60), eq(requestId));
    }

    @Test void heartbeatOnlyTriggersRealtimeRefreshWhenDeviceComesOnline() {
        device(DeviceType.DOOR_CONTROLLER);
        when(devices.touch("door-1")).thenReturn(false);
        gateway.handle("test/doors/door-1/status", message("{\"deviceSecret\":\"s\"}"));
        verify(notifications, never()).publishEvent(any(Object.class));
        when(devices.touch("door-1")).thenReturn(true);
        gateway.handle("test/doors/door-1/status", message("{\"deviceSecret\":\"s\"}"));
        verify(notifications, times(1)).publishEvent(any(com.smartaccess.config.RealtimeConfig.DeviceUpdated.class));
    }
}
