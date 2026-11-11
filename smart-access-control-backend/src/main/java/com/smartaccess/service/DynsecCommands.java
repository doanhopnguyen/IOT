package com.smartaccess.service;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.*;

/** Dựng lệnh cho plugin Mosquitto dynamic-security và đọc lỗi trong phản hồi. Không có I/O. */
public final class DynsecCommands {
    public static final String TOPIC = "$CONTROL/dynamic-security/v1";
    public static final String RESPONSE_TOPIC = TOPIC + "/response";
    private static final List<String> DEVICE_PUBLISH = List.of("status", "ack", "access", "face");
    private static final List<String> DEVICE_SUBSCRIBE = List.of("cmd", "config", "access-ack", "ack-confirm");
    // Lỗi mong đợi khi lệnh chạy lại cho cùng UID (nạp lại chip).
    private static final Set<String> TOLERATED = Set.of("deleteClient:Client not found", "createRole:Role already exists");

    private DynsecCommands() {}

    public static String roleName(String uid) { return "device-" + uid; }

    public static Map<String, Object> upsertDevice(String prefix, String uid, String password, String correlationData) {
        List<Map<String, Object>> acls = new ArrayList<>();
        for (String suffix : DEVICE_PUBLISH) acls.add(acl("publishClientSend", prefix + "/" + uid + "/" + suffix));
        for (String suffix : DEVICE_SUBSCRIBE) acls.add(acl("subscribeLiteral", prefix + "/" + uid + "/" + suffix));
        Map<String, Object> delete = command("deleteClient", correlationData);
        delete.put("username", uid);
        Map<String, Object> role = command("createRole", correlationData);
        role.put("rolename", roleName(uid));
        role.put("acls", acls);
        Map<String, Object> client = command("createClient", correlationData);
        client.put("username", uid);
        client.put("password", password);
        client.put("roles", List.of(Map.of("rolename", roleName(uid))));
        return Map.of("commands", List.of(delete, role, client));
    }

    public static Map<String, Object> disableDevice(String uid, String correlationData) {
        Map<String, Object> disable = command("disableClient", correlationData);
        disable.put("username", uid);
        return Map.of("commands", List.of(disable));
    }

    /** Lỗi đầu tiên thuộc correlationData, bỏ qua các lỗi chấp nhận được khi chạy lại. */
    public static Optional<String> failure(JsonNode response, String correlationData) {
        for (JsonNode item : response.path("responses")) {
            if (!correlationData.equals(item.path("correlationData").asText(null))) continue;
            String error = item.path("error").asText("");
            if (error.isEmpty() || TOLERATED.contains(item.path("command").asText() + ":" + error)) continue;
            return Optional.of(item.path("command").asText() + ": " + error);
        }
        return Optional.empty();
    }

    /** true khi phản hồi có ít nhất một mục thuộc correlationData. */
    public static boolean answers(JsonNode response, String correlationData) {
        for (JsonNode item : response.path("responses"))
            if (correlationData.equals(item.path("correlationData").asText(null))) return true;
        return false;
    }

    private static Map<String, Object> command(String name, String correlationData) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("command", name);
        out.put("correlationData", correlationData);
        return out;
    }

    private static Map<String, Object> acl(String type, String topic) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("acltype", type);
        out.put("topic", topic);
        out.put("priority", 0);
        out.put("allow", true);
        return out;
    }
}
