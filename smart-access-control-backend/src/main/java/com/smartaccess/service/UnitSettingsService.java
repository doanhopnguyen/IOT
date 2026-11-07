package com.smartaccess.service;

import com.smartaccess.config.RealtimeConfig;
import com.smartaccess.dto.unit.UnitSettings;
import com.smartaccess.exception.BusinessException;
import com.smartaccess.model.AccessUnit;
import com.smartaccess.model.AuditLog;
import com.smartaccess.repository.AccountRepository;
import com.smartaccess.repository.AuditLogRepository;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.Map;

/**
 * Chủ cửa đổi tham số cửa từ xa. Thiết bị nhận cấu hình mới qua bản tin config ở heartbeat kế tiếp
 * (≤ 5 giây) nên không cần lệnh riêng.
 */
@Service
public class UnitSettingsService {
    static final int UNLOCK_MIN = 1, UNLOCK_MAX = 30;
    static final int DOOR_OPEN_MIN = 10, DOOR_OPEN_MAX = 600;

    private final ManagerAccessGuard guard;
    private final AuditLogRepository audits;
    private final AccountRepository accounts;
    private final ApplicationEventPublisher notifications;

    public UnitSettingsService(ManagerAccessGuard guard, AuditLogRepository audits, AccountRepository accounts,
            ApplicationEventPublisher notifications) {
        this.guard = guard;
        this.audits = audits;
        this.accounts = accounts;
        this.notifications = notifications;
    }

    @Transactional(readOnly = true)
    public UnitSettings.Response get(Long managerId, Long unitId) {
        return UnitSettings.Response.from(guard.requireManagedUnit(managerId, unitId));
    }

    @Transactional
    public UnitSettings.Response update(Long managerId, Long unitId, UnitSettings.Request request) {
        if (request == null || request.isEmpty())
            throw new BusinessException(HttpStatus.BAD_REQUEST, "Cần ít nhất một thay đổi");
        check(request.unlockDurationSec(), UNLOCK_MIN, UNLOCK_MAX, "Thời gian mở khóa");
        check(request.doorOpenTimeoutSec(), DOOR_OPEN_MIN, DOOR_OPEN_MAX, "Ngưỡng cảnh báo cửa mở");
        AccessUnit unit = guard.requireManagedUnit(managerId, unitId);
        UnitSettings.Response before = UnitSettings.Response.from(unit);
        if (request.unlockDurationSec() != null) unit.setUnlockDurationSec(request.unlockDurationSec().shortValue());
        if (request.doorOpenTimeoutSec() != null) unit.setDoorOpenTimeoutSec(request.doorOpenTimeoutSec().shortValue());
        if (request.remoteUnlockEnabled() != null) unit.setRemoteUnlockEnabled(request.remoteUnlockEnabled());
        if (request.rfidEnabled() != null) unit.setRfidEnabled(request.rfidEnabled());
        if (request.fingerprintEnabled() != null) unit.setFingerprintEnabled(request.fingerprintEnabled());
        if (request.autoLockWaitForClose() != null) unit.setAutoLockWaitForClose(request.autoLockWaitForClose());
        UnitSettings.Response after = UnitSettings.Response.from(unit);
        if (!after.equals(before)) {
            AuditLog audit = new AuditLog();
            audit.setActor(accounts.getReferenceById(managerId));
            audit.setAction("UPDATE_UNIT_SETTINGS");
            audit.setEntityType("ACCESS_UNIT");
            audit.setEntityId(unitId);
            audit.setDetails(Map.of("unitId", unitId, "before", asMap(before), "after", asMap(after)));
            audits.save(audit);
            notifications.publishEvent(new RealtimeConfig.DeviceUpdated());
        }
        return after;
    }

    static Map<String, Object> asMap(UnitSettings.Response s) {
        return Map.of("unlockDurationSec", s.unlockDurationSec(), "doorOpenTimeoutSec", s.doorOpenTimeoutSec(),
                "remoteUnlockEnabled", s.remoteUnlockEnabled(), "rfidEnabled", s.rfidEnabled(),
                "fingerprintEnabled", s.fingerprintEnabled(),"autoLockWaitForClose",s.autoLockWaitForClose());
    }

    private static void check(Integer value, int min, int max, String label) {
        if (value != null && (value < min || value > max))
            throw new BusinessException(HttpStatus.BAD_REQUEST, label + " phải trong khoảng " + min + "–" + max + " giây");
    }
}
