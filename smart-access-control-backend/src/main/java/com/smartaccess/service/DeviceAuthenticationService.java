package com.smartaccess.service;

import com.smartaccess.model.Device;
import com.smartaccess.model.enumtype.DeviceLifecycleStatus;
import com.smartaccess.repository.DeviceRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.util.Set;
import static org.springframework.http.HttpStatus.UNAUTHORIZED;

@Service
public class DeviceAuthenticationService {
    private static final Set<DeviceLifecycleStatus> ALLOWED = Set.of(DeviceLifecycleStatus.REGISTERED,
            DeviceLifecycleStatus.PROVISIONED, DeviceLifecycleStatus.ACTIVE);
    private final DeviceRepository devices;
    private final PasswordEncoder passwords;

    public DeviceAuthenticationService(DeviceRepository devices, PasswordEncoder passwords) {
        this.devices = devices;
        this.passwords = passwords;
    }

    @Transactional(readOnly = true)
    public Device authenticate(String uid, String secret) {
        if (uid == null || uid.length() > 64 || secret == null || secret.length() < 24 || secret.length() > 128)
            throw invalid();
        Device device = devices.findByDeviceUid(uid).orElseThrow(DeviceAuthenticationService::invalid);
        if ((device.getAccessUnit() == null && device.getBootstrapSecretHash() == null) || !ALLOWED.contains(device.getLifecycleStatus())
                || device.getDeviceSecretHash() == null || !passwords.matches(secret, device.getDeviceSecretHash()))
            throw invalid();
        // Nạp cửa để có thể dùng quan hệ này sau khi giao dịch của bộ lọc kết thúc.
        if (device.getAccessUnit() != null) device.getAccessUnit().getUnitName();
        return device;
    }

    /** Chỉ dùng cho heartbeat: thiết bị SUSPENDED được nhận cấu hình rút gọn để biết mình bị tạm ngưng. */
    @Transactional(readOnly = true)
    public Device authenticateSuspended(String uid, String secret) {
        if (uid == null || uid.length() > 64 || secret == null || secret.length() < 24 || secret.length() > 128)
            throw invalid();
        Device device = devices.findByDeviceUid(uid).orElseThrow(DeviceAuthenticationService::invalid);
        if (device.getLifecycleStatus() != DeviceLifecycleStatus.SUSPENDED || device.getDeviceSecretHash() == null
                || !passwords.matches(secret, device.getDeviceSecretHash()))
            throw invalid();
        return device;
    }

    private static ResponseStatusException invalid() {
        return new ResponseStatusException(UNAUTHORIZED, "Thông tin xác thực thiết bị không hợp lệ hoặc thiết bị đã bị vô hiệu hóa.");
    }
}
