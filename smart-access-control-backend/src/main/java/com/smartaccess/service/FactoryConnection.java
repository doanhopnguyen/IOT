package com.smartaccess.service;

import com.smartaccess.exception.BusinessException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import static org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE;

/** Địa chỉ broker mà chip sẽ dùng, do bên triển khai cấu hình; người mua không nhập. */
@Component
public class FactoryConnection {
    private final String mqttHost;
    private final int mqttPort;
    private final boolean mqttTls;
    private final String mqttCa;

    /** mqttCa là nội dung PEM; khi chạy Spring nó được đọc từ file PROVISION_MQTT_CA_FILE. */

    public FactoryConnection(@Value("${app.provisioning.mqtt-host:}") String mqttHost,
                             @Value("${app.provisioning.mqtt-port:1884}") int mqttPort,
                             @Value("${app.provisioning.mqtt-tls:false}") boolean mqttTls,
                             @Value("#{T(com.smartaccess.service.FactoryConnection).readCa('${app.provisioning.mqtt-ca-file:}')}") String mqttCa) {
        this.mqttHost = mqttHost == null ? "" : mqttHost.trim();
        this.mqttPort = mqttPort;
        this.mqttTls = mqttTls;
        this.mqttCa = mqttCa == null ? "" : mqttCa;
    }

    public static String readCa(String file) {
        if (file == null || file.isBlank()) return "";
        try { return Files.readString(Path.of(file), StandardCharsets.UTF_8); }
        catch (IOException | InvalidPathException e) { return ""; }
    }

    public String mqttHost() { return mqttHost; }
    public int mqttPort() { return mqttPort; }
    public boolean mqttTls() { return mqttTls; }

    public void requireConfigured() {
        if (mqttHost.isEmpty() || mqttPort < 1 || mqttPort > 65535)
            throw new BusinessException(SERVICE_UNAVAILABLE, "Chưa cấu hình địa chỉ broker cho thiết bị (PROVISION_MQTT_HOST)");
        if (mqttTls && mqttCa.isBlank())
            throw new BusinessException(SERVICE_UNAVAILABLE, "Broker TLS cần chứng chỉ CA (PROVISION_MQTT_CA_FILE)");
    }

    public Map<String, Object> forDevice(String uid, String mqttPassword) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("mqttHost", mqttHost);
        out.put("mqttPort", mqttPort);
        out.put("mqttUser", uid);
        out.put("mqttPassword", mqttPassword);
        out.put("mqttTls", mqttTls);
        out.put("allowLocalPlaintext", !mqttTls);
        if (mqttTls) out.put("mqttCa", mqttCa);
        return out;
    }
}
