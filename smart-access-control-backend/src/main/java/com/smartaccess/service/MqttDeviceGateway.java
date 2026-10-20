package com.smartaccess.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.eclipse.paho.client.mqttv3.*;
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Đẩy lệnh xuống thiết bị qua MQTT và nhận phản hồi.
 * Topic: {prefix}/{deviceUid}/cmd (backend → thiết bị), /ack, /status, /access (thiết bị → backend).
 */
@Component
public class MqttDeviceGateway implements DeviceGateway {
    private static final Logger log = LoggerFactory.getLogger(MqttDeviceGateway.class);
    private static final long RETRY_MS = 10_000;

    private final String brokerUrl;
    private final String prefix;
    private final ObjectMapper json;
    private final DeviceService deviceService;
    private final CommandAckService ackService;
    private final AccessEventService accessEvents;
    private MqttClient client;
    private volatile boolean running = true;

    public MqttDeviceGateway(@Value("${app.mqtt.broker-url}") String brokerUrl,
            @Value("${app.mqtt.topic-prefix}") String prefix, ObjectMapper json,
            DeviceService deviceService, CommandAckService ackService, AccessEventService accessEvents) {
        this.brokerUrl = brokerUrl;
        this.prefix = prefix;
        this.json = json;
        this.deviceService = deviceService;
        this.ackService = ackService;
        this.accessEvents = accessEvents;
    }

    @PostConstruct
    void start() throws MqttException {
        client = new MqttClient(brokerUrl, "smartdoor-backend-" + UUID.randomUUID(), new MemoryPersistence());
        client.setCallback(new MqttCallbackExtended() {
            @Override public void connectComplete(boolean reconnect, String serverUri) { subscribe(); }
            @Override public void connectionLost(Throwable cause) { log.warn("Mất kết nối MQTT: {}", cause.getMessage()); }
            @Override public void messageArrived(String topic, MqttMessage message) { handle(topic, message); }
            @Override public void deliveryComplete(IMqttDeliveryToken token) { }
        });
        // Kết nối ở thread nền để backend vẫn khởi động khi broker chưa sẵn sàng
        Thread connector = new Thread(this::connectUntilReady, "mqtt-connector");
        connector.setDaemon(true);
        connector.start();
    }

    private void connectUntilReady() {
        MqttConnectOptions options = new MqttConnectOptions();
        options.setAutomaticReconnect(true);
        options.setCleanSession(true);
        options.setConnectionTimeout(10);
        while (running && !client.isConnected()) {
            try {
                client.connect(options);
                log.info("Đã kết nối MQTT broker {}", brokerUrl);
            } catch (MqttException e) {
                log.warn("Chưa kết nối được MQTT broker {}: {}. Thử lại sau {} giây", brokerUrl, e.getMessage(), RETRY_MS / 1000);
                try { Thread.sleep(RETRY_MS); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); return; }
            }
        }
    }

    private void subscribe() {
        try {
            client.subscribe(new String[] {prefix + "/+/ack", prefix + "/+/status", prefix + "/+/access"}, new int[] {1, 0, 1});
        } catch (MqttException e) {
            log.error("Không subscribe được topic thiết bị", e);
        }
    }

    @Override
    public void send(String deviceUid, String commandUuid, String commandType, Map<String, Object> data) {
        if (client == null || !client.isConnected()) {
            throw new IllegalStateException("MQTT broker chưa kết nối");
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("commandUuid", commandUuid);
        body.put("commandType", commandType);
        body.put("data", data == null ? Map.of() : data);
        try {
            MqttMessage message = new MqttMessage(json.writeValueAsBytes(body));
            message.setQos(1);
            client.publish(prefix + "/" + deviceUid + "/cmd", message);
            // Không in data ra log vì lệnh PIN_SET chứa mã PIN dạng rõ
            log.info("Gửi lệnh {} ({}) tới thiết bị {}", commandType, commandUuid, deviceUid);
        } catch (Exception e) {
            throw new IllegalStateException("Không gửi được lệnh qua MQTT", e);
        }
    }

    private void handle(String topic, MqttMessage message) {
        String[] parts = topic.split("/");
        if (parts.length < 3) { return; }
        String deviceUid = parts[parts.length - 2];
        String kind = parts[parts.length - 1];
        try {
            deviceService.touch(deviceUid);
            switch (kind) {
                case "ack" -> {
                    JsonNode ack = json.readTree(new String(message.getPayload(), StandardCharsets.UTF_8));
                    ackService.handleAck(deviceUid, ack.path("commandUuid").asText(""),
                            ack.path("success").asBoolean(false), text(ack, "message"));
                }
                case "access" -> {
                    JsonNode event = json.readTree(new String(message.getPayload(), StandardCharsets.UTF_8));
                    if ("FINGERPRINT".equals(event.path("method").asText())) {
                        Integer templateId = event.hasNonNull("templateId") ? event.get("templateId").asInt() : null;
                        accessEvents.recordFingerprint(deviceUid, templateId, "GRANTED".equals(event.path("result").asText()));
                    }
                }
                default -> { } // status: heartbeat đã xử lý bằng touch()
            }
        } catch (Exception e) {
            log.error("Lỗi xử lý tin nhắn MQTT trên {}", topic, e);
        }
    }

    private static String text(JsonNode node, String field) {
        return node.hasNonNull(field) ? node.get(field).asText() : null;
    }

    @PreDestroy
    void stop() {
        running = false;
        try {
            if (client != null && client.isConnected()) { client.disconnect(); }
            if (client != null) { client.close(); }
        } catch (MqttException e) {
            log.warn("Lỗi khi đóng kết nối MQTT: {}", e.getMessage());
        }
    }
}
