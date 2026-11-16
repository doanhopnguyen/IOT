package com.smartaccess;

import com.smartaccess.model.*;
import com.smartaccess.model.enumtype.*;
import com.smartaccess.repository.*;
import com.smartaccess.service.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;
import static org.assertj.core.api.Assertions.*;

/** Camera AI chỉ ghép được bằng mã dùng một lần do admin cấp; thu hồi/tạm ngưng chặn ghép và xác thực. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE, properties = {
        "spring.datasource.url=jdbc:h2:mem:edgepairing;MODE=MySQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa", "spring.datasource.password=", "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.flyway.enabled=false", "spring.jpa.hibernate.ddl-auto=create-drop", "app.mqtt.enabled=false"})
class EdgeAiPairingTest {
    static final String PASSWORD = "OwnerPass!123";
    @Autowired EdgeAiPairingService pairing;
    @Autowired DeviceAuthenticationService authentication;
    @Autowired AccountRepository accounts;
    @Autowired AccessUnitRepository units;
    @Autowired DeviceRepository devices;
    @Autowired PasswordEncoder passwords;
    static int seq;
    Long adminId, ownerId, otherId, unitId, otherUnitId;

    @BeforeEach void seed() {
        int n = ++seq;
        adminId = account("edge-admin" + n, true); ownerId = account("edge-owner" + n, false); otherId = account("edge-other" + n, false);
        unitId = unit(ownerId, "Cửa " + n); otherUnitId = unit(otherId, "Cửa khác " + n);
    }
    Long account(String name, boolean admin) {
        Account a = new Account(); a.setFullName(name); a.setEmail(name + "@edge.test"); a.setAdmin(admin);
        a.setPasswordHash(passwords.encode(PASSWORD)); return accounts.saveAndFlush(a).getAccountId();
    }
    Long unit(Long managerId, String name) {
        AccessUnit u = new AccessUnit(); u.setUnitName(name); u.setManager(accounts.getReferenceById(managerId));
        return units.saveAndFlush(u).getUnitId();
    }
    static ResponseStatusException rejected(org.assertj.core.api.ThrowableAssert.ThrowingCallable call) {
        return catchThrowableOfType(ResponseStatusException.class, call);
    }

    @Test void adminKitPairsOnceWithCodeAndPasswordThenAuthenticates() {
        var kit = pairing.createKit(adminId, "Laptop cổng chính");
        assertThat(kit.pairingCode()).matches("AI(-[0-9A-F]{6}){4}");
        assertThat(kit.device().awaitingPairing()).isTrue();
        assertThat(kit.device().unitId()).isNull();
        // Chưa ghép thì chưa có secret, không xác thực được.
        assertThatThrownBy(() -> authentication.authenticate(kit.device().deviceUid(), "x".repeat(40))).isInstanceOf(ResponseStatusException.class);

        // Thiếu mã, sai mật khẩu, cửa của người khác: đều bị chặn và mã vẫn còn hiệu lực.
        assertThat(rejected(() -> pairing.pair(ownerId, unitId, "", PASSWORD)).getStatusCode().value()).isEqualTo(400);
        assertThat(rejected(() -> pairing.pair(ownerId, unitId, kit.pairingCode(), "wrong")).getStatusCode().value()).isEqualTo(403);
        assertThatThrownBy(() -> pairing.pair(ownerId, otherUnitId, kit.pairingCode(), PASSWORD)).isInstanceOf(RuntimeException.class);

        // Gõ chữ thường/khoảng trắng vẫn nhận.
        var issued = pairing.pair(ownerId, unitId, " " + kit.pairingCode().toLowerCase() + " ", PASSWORD);
        assertThat(issued.deviceUid()).isEqualTo(kit.device().deviceUid());
        Device camera = authentication.authenticate(issued.deviceUid(), issued.deviceSecret());
        assertThat(camera.getAccessUnit().getUnitId()).isEqualTo(unitId);
        assertThat(camera.getLifecycleStatus()).isEqualTo(DeviceLifecycleStatus.PROVISIONED);
        assertThat(devices.findByDeviceUid(issued.deviceUid()).orElseThrow().getPairingCodeHash()).isNull();

        // Mã chỉ dùng một lần.
        assertThat(rejected(() -> pairing.pair(otherId, otherUnitId, kit.pairingCode(), PASSWORD)).getStatusCode().value()).isEqualTo(404);
    }

    @Test void doorWithCameraRejectsSecondKitUntilOldCameraRemoved() {
        var first = pairing.createKit(adminId, "Laptop 1"); var second = pairing.createKit(adminId, "Laptop 2");
        pairing.pair(ownerId, unitId, first.pairingCode(), PASSWORD);
        assertThat(rejected(() -> pairing.pair(ownerId, unitId, second.pairingCode(), PASSWORD)).getStatusCode().value()).isEqualTo(409);
        // Mã thứ hai không bị tiêu hao khi bị từ chối.
        assertThat(devices.findByDeviceUid(second.device().deviceUid()).orElseThrow().getPairingCodeHash()).isNotNull();
    }

    @Test void suspendedOrRevokedKitCannotBePairedAndReissueOnlyForUnpaired() {
        var kit = pairing.createKit(adminId, "Laptop");
        var fresh = pairing.reissueCode(adminId, kit.device().deviceUid());
        assertThat(fresh.pairingCode()).isNotEqualTo(kit.pairingCode());
        assertThat(rejected(() -> pairing.pair(ownerId, unitId, kit.pairingCode(), PASSWORD)).getStatusCode().value()).isEqualTo(404);

        Device d = devices.findByDeviceUid(kit.device().deviceUid()).orElseThrow();
        d.setLifecycleStatus(DeviceLifecycleStatus.DECOMMISSIONED); devices.saveAndFlush(d);
        assertThat(rejected(() -> pairing.pair(ownerId, unitId, fresh.pairingCode(), PASSWORD)).getStatusCode().value()).isEqualTo(409);
        assertThat(rejected(() -> pairing.reissueCode(adminId, kit.device().deviceUid())).getStatusCode().value()).isEqualTo(409);

        var paired = pairing.createKit(adminId, "Laptop 2");
        pairing.pair(ownerId, unitId, paired.pairingCode(), PASSWORD);
        assertThat(rejected(() -> pairing.reissueCode(adminId, paired.device().deviceUid())).getStatusCode().value()).isEqualTo(409);
    }
}
