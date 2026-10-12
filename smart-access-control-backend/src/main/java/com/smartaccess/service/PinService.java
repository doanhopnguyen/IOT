package com.smartaccess.service;

import com.smartaccess.dto.manager.ChangePinRequest;
import com.smartaccess.dto.manager.CommandResponse;
import com.smartaccess.exception.BusinessException;
import com.smartaccess.model.Device;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.Map;

@Service
public class PinService {
    public static final String PIN_SET = "PIN_SET";

    private final ManagerAccessGuard guard;
    private final DeviceCommandService commands;
    private final PasswordEncoder passwordEncoder;

    public PinService(ManagerAccessGuard guard, DeviceCommandService commands,
            PasswordEncoder passwordEncoder) {
        this.guard = guard;
        this.commands = commands;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional
    public CommandResponse changePin(Long managerId, Long unitId, ChangePinRequest request) {
        if (request == null || request.pin() == null || !request.pin().matches("\\d{6}")) {
            throw new BusinessException(HttpStatus.BAD_REQUEST, "Mã PIN không hợp lệ");
        }
        if (!request.pin().equals(request.confirmPin())) {
            throw new BusinessException(HttpStatus.BAD_REQUEST, "Mã PIN nhập lại không khớp");
        }
        guard.requireManagedUnit(managerId, unitId);
        Device device = guard.requireOnlineController(unitId);

        Map<String, Object> payload = Map.of(
                "unitId", unitId,
                "pinHash", passwordEncoder.encode(request.pin()));
        Map<String, Object> wireData = Map.of("pin", request.pin());
        return CommandResponse.from(commands.dispatch(device, managerId, PIN_SET, payload, wireData));
    }
}
