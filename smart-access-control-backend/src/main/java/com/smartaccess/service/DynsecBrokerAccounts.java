package com.smartaccess.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartaccess.exception.BusinessException;
import jakarta.annotation.PreDestroy;
import org.eclipse.paho.client.mqttv3.*;
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import java.util.*;
import java.util.concurrent.*;
import static org.springframework.http.HttpStatus.BAD_GATEWAY;

/**
 * Gửi lệnh tới plugin dynamic-security qua MQTT bằng tài khoản backend (cần role admin của dynsec).
 * Khi app.mqtt.enabled=false (test/demo không có broker) thì không làm gì.
 */
@Component
public class DynsecBrokerAccounts implements BrokerAccounts {
    private static final Logger log = LoggerFactory.getLogger(DynsecBrokerAccounts.class);
    private static final long TIMEOUT_SECONDS = 5;
    private final boolean enabled;
    private final String brokerUrl, prefix, username, password;
    private final ObjectMapper json;
    private final Map<String, CompletableFuture<JsonNode>> pending = new ConcurrentHashMap<>();
    private MqttClient client;

    public DynsecBrokerAccounts(@Value("${app.mqtt.enabled:true}") boolean enabled,
                                @Value("${app.mqtt.broker-url}") String brokerUrl,
                                @Value("${app.mqtt.topic-prefix}") String prefix,
                                @Value("${app.mqtt.username:}") String username,
                                @Value("${app.mqtt.password:}") String password, ObjectMapper json) {
        this.enabled = enabled; this.brokerUrl = brokerUrl; this.prefix = prefix;
        this.username = username; this.password = password; this.json = json;
    }

    @Override public void upsertDevice(String uid, String devicePassword) {
        String id = UUID.randomUUID().toString();
        execute(DynsecCommands.upsertDevice(prefix, uid, devicePassword, id), id);
    }

    @Override public void disableDevice(String uid) {
        String id = UUID.randomUUID().toString();
        execute(DynsecCommands.disableDevice(uid, id), id);
    }

    private void execute(Map<String, Object> request, String correlationData) {
        if (!enabled) return;
        CompletableFuture<JsonNode> answer = new CompletableFuture<>();
        pending.put(correlationData, answer);
        try {
            MqttClient connected = connect();
            MqttMessage message = new MqttMessage(json.writeValueAsBytes(request));
            message.setQos(1);
            connected.publish(DynsecCommands.TOPIC, message);
            JsonNode response = answer.get(TIMEOUT_SECONDS, TimeUnit.SECONDS);
            Optional<String> failure = DynsecCommands.failure(response, correlationData);
            if (failure.isPresent()) {
                log.warn("Dynamic security từ chối lệnh: {}", failure.get());
                throw unavailable();
            }
        } catch (BusinessException e) {
            throw e;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw unavailable();
        } catch (Exception e) {
            // Không log request: có mật khẩu thiết bị.
            log.warn("Không gửi được lệnh dynamic security: {}", e.getClass().getSimpleName());
            throw unavailable();
        } finally {
            pending.remove(correlationData);
        }
    }

    private synchronized MqttClient connect() throws MqttException {
        if (client != null && client.isConnected()) return client;
        if (client == null) {
            client = new MqttClient(brokerUrl, "smartdoor-dynsec-" + UUID.randomUUID(), new MemoryPersistence());
            client.setCallback(new MqttCallback() {
                @Override public void connectionLost(Throwable cause) { }
                @Override public void messageArrived(String topic, MqttMessage message) { resolve(message); }
                @Override public void deliveryComplete(IMqttDeliveryToken token) { }
            });
        }
        MqttConnectOptions options = new MqttConnectOptions();
        options.setCleanSession(true);
        options.setConnectionTimeout(5);
        if (!username.isBlank()) { options.setUserName(username); options.setPassword(password.toCharArray()); }
        client.connect(options);
        client.subscribe(DynsecCommands.RESPONSE_TOPIC, 1);
        return client;
    }

    private void resolve(MqttMessage message) {
        try {
            JsonNode response = json.readTree(message.getPayload());
            for (var entry : pending.entrySet())
                if (DynsecCommands.answers(response, entry.getKey())) entry.getValue().complete(response);
        } catch (Exception ignored) { }
    }

    private static BusinessException unavailable() {
        return new BusinessException(BAD_GATEWAY, "Broker MQTT chưa tạo được tài khoản thiết bị");
    }

    @PreDestroy synchronized void stop() {
        try { if (client != null && client.isConnected()) client.disconnect(); } catch (MqttException ignored) { }
    }
}
