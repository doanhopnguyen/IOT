package com.smartaccess.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartaccess.exception.BusinessException;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

class DynsecCommandsTest {
    static final String UID = "ESP32-80B54EC8149C";
    final ObjectMapper json = new ObjectMapper();

    @SuppressWarnings("unchecked")
    static List<Map<String, Object>> commands(Map<String, Object> request) {
        return (List<Map<String, Object>>) request.get("commands");
    }

    @Test
    @SuppressWarnings("unchecked")
    void upsertDeviceDeletesThenCreatesRoleAndClientScopedToUid() {
        var list = commands(DynsecCommands.upsertDevice("smartdoor-iot", UID, "secret-pw", "c1"));
        assertThat(list).extracting(c -> c.get("command")).containsExactly("deleteClient", "createRole", "createClient");
        assertThat(list).allSatisfy(c -> assertThat(c.get("correlationData")).isEqualTo("c1"));
        var role = list.get(1);
        assertThat(role.get("rolename")).isEqualTo("device-" + UID);
        var acls = (List<Map<String, Object>>) role.get("acls");
        assertThat(acls).hasSize(8).allSatisfy(a -> assertThat(a.get("allow")).isEqualTo(true));
        String base = "smartdoor-iot/" + UID + "/";
        assertThat(acls).filteredOn(a -> a.get("acltype").equals("publishClientSend")).extracting(a -> a.get("topic"))
                .containsExactlyInAnyOrder(base + "status", base + "ack", base + "access", base + "face");
        assertThat(acls).filteredOn(a -> a.get("acltype").equals("subscribeLiteral")).extracting(a -> a.get("topic"))
                .containsExactlyInAnyOrder(base + "cmd", base + "config", base + "access-ack", base + "ack-confirm");
        assertThat(acls).extracting(a -> (String) a.get("topic")).noneMatch(t -> t.contains("+") || t.contains("#"));
        var client = list.get(2);
        assertThat(client.get("username")).isEqualTo(UID);
        assertThat(client.get("password")).isEqualTo("secret-pw");
        assertThat(client.get("roles")).isEqualTo(List.of(Map.of("rolename", "device-" + UID)));
    }

    @Test
    void disableDeviceTargetsTheClient() {
        var list = commands(DynsecCommands.disableDevice(UID, "c2"));
        assertThat(list).singleElement().satisfies(c -> {
            assertThat(c.get("command")).isEqualTo("disableClient");
            assertThat(c.get("username")).isEqualTo(UID);
        });
    }

    @Test
    void failureToleratesMissingClientAndExistingRole() throws Exception {
        String ok = """
            {"responses":[{"command":"deleteClient","error":"Client not found","correlationData":"c1"},
            {"command":"createRole","error":"Role already exists","correlationData":"c1"},
            {"command":"createClient","correlationData":"c1"}]}""";
        assertThat(DynsecCommands.failure(json.readTree(ok), "c1")).isEmpty();
        String bad = ok.replace("{\"command\":\"createClient\",", "{\"command\":\"createClient\",\"error\":\"Client already exists\",");
        assertThat(DynsecCommands.failure(json.readTree(bad), "c1")).isPresent();
        assertThat(DynsecCommands.failure(json.readTree(bad), "other")).isEmpty();
    }

    @Test
    void forDeviceDefaultsToPlaintextLanOnlyWhenTlsOff() {
        var plain = new FactoryConnection("192.168.1.10", 1884, false, "");
        plain.requireConfigured();
        var map = plain.forDevice(UID, "pw");
        assertThat(map).containsEntry("mqttHost", "192.168.1.10").containsEntry("mqttPort", 1884)
                .containsEntry("mqttUser", UID).containsEntry("mqttPassword", "pw")
                .containsEntry("mqttTls", false).containsEntry("allowLocalPlaintext", true).doesNotContainKey("mqttCa");
        assertThatThrownBy(() -> new FactoryConnection("broker.example", 8883, true, "").requireConfigured())
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> new FactoryConnection("", 1884, false, "").requireConfigured())
                .isInstanceOf(BusinessException.class).hasMessageContaining("PROVISION_MQTT_HOST");
        var tls = new FactoryConnection("broker.example", 8883, true, "-----BEGIN CERTIFICATE-----");
        assertThat(tls.forDevice(UID, "pw")).containsEntry("allowLocalPlaintext", false).containsKey("mqttCa");
    }
}
