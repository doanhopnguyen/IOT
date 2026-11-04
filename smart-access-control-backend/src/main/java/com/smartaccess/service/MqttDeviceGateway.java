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
    @org.springframework.beans.factory.annotation.Autowired(required=false)
    @org.springframework.context.annotation.Lazy
    private DeploymentService deployment;
    private static final Logger log = LoggerFactory.getLogger(MqttDeviceGateway.class);
    private static final long RETRY_MS = 10_000;

    private final String brokerUrl;
    private final String prefix;
    private final ObjectMapper json;
    private final DeviceService deviceService;
    private final CommandAckService ackService;
    private final AccessEventService accessEvents;
    private final DeviceAuthenticationService authentication;
    private final FaceRecognitionService faceRecognition;
    private final String username;
    private final String password;
    private final LocalAccessPolicyService policies;
    private final org.springframework.context.ApplicationEventPublisher notifications;
    private final java.util.concurrent.ExecutorService outbound = java.util.concurrent.Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "mqtt-responses"); t.setDaemon(true); return t;
    });
    @Value("${app.mqtt.enabled:true}") private boolean enabled;
    private MqttClient client;
    private volatile boolean running = true;

    public MqttDeviceGateway(@Value("${app.mqtt.broker-url}") String brokerUrl,
            @Value("${app.mqtt.topic-prefix}") String prefix, ObjectMapper json,
            DeviceService deviceService, CommandAckService ackService, AccessEventService accessEvents,
            DeviceAuthenticationService authentication, @org.springframework.context.annotation.Lazy FaceRecognitionService faceRecognition,
            @Value("${app.mqtt.username:}") String username, @Value("${app.mqtt.password:}") String password,
            LocalAccessPolicyService policies, org.springframework.context.ApplicationEventPublisher notifications) {
        this.brokerUrl = brokerUrl;
        this.prefix = prefix;
        this.json = json;
        this.deviceService = deviceService;
        this.ackService = ackService;
        this.accessEvents = accessEvents;
        this.authentication = authentication; this.faceRecognition = faceRecognition;
        this.username = username; this.password = password;
        this.policies = policies;
        this.notifications = notifications;
    }

    @PostConstruct
    void start() throws MqttException {
        if (!enabled) return;
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
        if (!username.isBlank()) {
            options.setUserName(username); options.setPassword(password.toCharArray());
        }
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
            client.subscribe(new String[] {prefix + "/+/ack", prefix + "/+/status", prefix + "/+/access", prefix + "/+/face"}, new int[] {1, 0, 1, 1});
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
        Map<String,Object> wire=new LinkedHashMap<>(data==null?Map.of():data);
        if(deployment!=null) {long generation=deployment.generation(deviceUid);if(generation>0)wire.put("generation",generation);}
        body.put("data", wire);
        body.put("issuedAt", java.time.Instant.now().getEpochSecond());
        body.put("ttlSec", "DOOR_UNLOCK".equals(commandType) ? 10 : 60);
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

    void handle(String topic, MqttMessage message) {
        String root = prefix + "/";
        if (!topic.startsWith(root) || message.isRetained() || message.getPayload().length > 16384) return;
        String[] parts = topic.substring(root.length()).split("/", -1);
        if (parts.length != 2 || parts[0].isBlank()) return;
        String deviceUid = parts[0];
        String kind = parts[1];
        if (!java.util.Set.of("face", "ack", "status", "access").contains(kind)) return;
        try {
            JsonNode body = json.readTree(message.getPayload());
            var device = authentication.authenticate(deviceUid, text(body, "deviceSecret"));
            if (deployment != null && !"status".equals(kind) && !deployment.acceptGeneration(device, body)) return;
            if ("face".equals(kind)) {
                if (device.getDeviceType() != com.smartaccess.model.enumtype.DeviceType.FACE_CAMERA_NODE) return;
                deviceService.touch(deviceUid);
                faceRecognition.receive(deviceUid, body);
                return;
            }
            if (device.getDeviceType() != com.smartaccess.model.enumtype.DeviceType.DOOR_CONTROLLER) return;
            deviceService.touch(deviceUid);
            switch (kind) {
                case "ack" -> {
                    if (deployment != null && deployment.resetAck(deviceUid, body)) {
                        reply(deviceUid, "ack-confirm", Map.of("commandUuid", body.path("commandUuid").asText()));
                        break;
                    }
                    JsonNode ack = body;
                    ackService.handleAck(deviceUid, ack.path("commandUuid").asText(""),
                            ack.path("success").asBoolean(false), text(ack, "message"));
                    reply(deviceUid, "ack-confirm", Map.of("commandUuid", ack.path("commandUuid").asText()));
                }
                case "access" -> {
                    accessEvents.recordLocal(deviceUid, body);
                    reply(deviceUid, "access-ack", Map.of("eventUuid", body.path("eventUuid").asText()));
                }
                case "status" -> {
                    String requestId = body.path("requestId").asText();
                    if (requestId.length() != 36) return;
                    Map<String, Object> config = new LinkedHashMap<>();
                    if (deployment != null) config.putAll(deployment.wireConfig(deviceUid, body));
                    if (device.getAccessUnit() != null && !"RESETTING".equals(config.get("activationState")))
                        config.putAll(policies.snapshot(deviceUid));
                    config.put("serverTime", java.time.Instant.now().getEpochSecond());
                    config.put("requestId", requestId);
                    reply(deviceUid, "config", config);
                }
                default -> { } // Trạng thái heartbeat đã được xử lý bằng touch().
            }
            notifications.publishEvent(new com.smartaccess.config.RealtimeConfig.DeviceUpdated());
        } catch (Exception e) {
            log.warn("Đã từ chối tin nhắn MQTT trên {} ({})", topic, e.getClass().getSimpleName());
        }
    }

    // Publishing QoS 1 from messageArrived would block Paho's ACK processing thread.
    private void reply(String uid, String suffix, Map<String, Object> body) {
        outbound.execute(() -> {
            try {
                MqttMessage message = new MqttMessage(json.writeValueAsBytes(body));
                message.setQos(1);
                client.publish(prefix + "/" + uid + "/" + suffix, message);
            } catch (Exception e) { log.warn("Không gửi được phản hồi MQTT {}", suffix); }
        });
    }

    private static String text(JsonNode node, String field) {
        return node.hasNonNull(field) ? node.get(field).asText() : null;
    }

    @PreDestroy
    void stop() {
        running = false;
        outbound.shutdownNow();
        try {
            if (client != null && client.isConnected()) { client.disconnect(); }
            if (client != null) { client.close(); }
        } catch (MqttException e) {
            log.warn("Lỗi khi đóng kết nối MQTT: {}", e.getMessage());
        }
    }
}
