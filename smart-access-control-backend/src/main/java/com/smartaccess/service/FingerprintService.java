package com.smartaccess.service;

import com.smartaccess.dto.manager.AddFingerprintRequest;
import com.smartaccess.dto.manager.CommandResponse;
import com.smartaccess.exception.BusinessException;
import com.smartaccess.model.Credential;
import com.smartaccess.model.Device;
import com.smartaccess.model.enumtype.CommandStatus;
import com.smartaccess.model.enumtype.CredentialStatus;
import com.smartaccess.model.enumtype.CredentialType;
import com.smartaccess.repository.CommandRepository;
import com.smartaccess.repository.CredentialRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

@Service
public class FingerprintService {
    public static final String FP_ENROLL = "FP_ENROLL";
    public static final String FP_DELETE = "FP_DELETE";
    private static final int MAX_SLOT = 127;
    private static final List<CommandStatus> IN_FLIGHT =
            List.of(CommandStatus.PENDING, CommandStatus.SENT);

    private final ManagerAccessGuard guard;
    private final DeviceCommandService commands;
    private final CommandRepository commandRepository;
    private final CredentialRepository credentials;
    private final com.smartaccess.repository.DeviceRepository devices;
    private final MemberRemovalService removals;

    public FingerprintService(ManagerAccessGuard guard, DeviceCommandService commands,
            CommandRepository commandRepository, CredentialRepository credentials,
            com.smartaccess.repository.DeviceRepository devices, MemberRemovalService removals) {
        this.guard = guard;
        this.commands = commands;
        this.commandRepository = commandRepository;
        this.credentials = credentials;
        this.devices = devices; this.removals = removals;
    }

    @Transactional
    public CommandResponse startEnroll(Long managerId, Long unitId, Long accountId,
            AddFingerprintRequest request) {
        String label = request == null || request.label() == null ? "" : request.label().trim();
        if (label.isEmpty() || label.length() > 50) {
            throw new BusinessException(HttpStatus.BAD_REQUEST, "Tên gợi nhớ là bắt buộc và tối đa 50 ký tự");
        }
        guard.requireManagedUnit(managerId, unitId);
        guard.requireUserOfUnit(accountId, unitId);
        Device device = guard.requireOnlineController(unitId);
        device=devices.findByDeviceUidForUpdate(device.getDeviceUid()).orElseThrow();
        removals.requireNoCleanup(device);

        if (commandRepository.existsByDevice_DeviceIdAndCommandTypeAndStatusIn(
                device.getDeviceId(), FP_ENROLL, IN_FLIGHT)) {
            throw new BusinessException(HttpStatus.CONFLICT, "Thiết bị đang đăng ký một vân tay khác");
        }
        Set<Integer> used = usedSlots(device.getDeviceId());
        int slot = nextFreeSlot(used);

        Map<String, Object> payload = Map.of("accountId", accountId, "templateId", slot, "label", label);
        // usedSlots: firmware tránh các ô này khi phải chọn ô khác (cảm biến còn mẫu cũ ở ô đề nghị).
        Map<String, Object> wireData = Map.of("templateId", slot, "usedSlots", used.stream().sorted().toList());
        return CommandResponse.from(commands.dispatch(device, managerId, FP_ENROLL, payload, wireData));
    }

    @Transactional
    public CommandResponse startDelete(Long managerId, Long unitId, Long accountId, Long credentialId) {
        guard.requireManagedUnit(managerId, unitId);
        Credential credential = credentials.findById(credentialId)
                .filter(c -> c.getCredentialType() == CredentialType.FINGERPRINT)
                .filter(c -> c.getStatus() == CredentialStatus.ACTIVE)
                .filter(c -> c.getAccount().getAccountId().equals(accountId))
                .filter(c -> c.getDevice() != null && c.getDevice().getAccessUnit() != null
                        && c.getDevice().getAccessUnit().getUnitId().equals(unitId))
                .orElseThrow(() -> new BusinessException(HttpStatus.NOT_FOUND, "Vân tay không tồn tại"));
        Device device = guard.requireOnlineController(unitId);

        Map<String, Object> payload = Map.of("credentialId", credentialId);
        device=devices.findByDeviceUidForUpdate(device.getDeviceUid()).orElseThrow();
        removals.requireNoCleanup(device);
        Map<String, Object> wireData = Map.of("templateId", credential.getLocalTemplateId().intValue());
        return CommandResponse.from(commands.dispatch(device, managerId, FP_DELETE, payload, wireData));
    }

    /** Các ô vân tay đang thuộc credential ACTIVE của thiết bị. */
    public Set<Integer> usedSlots(Long deviceId) {
        return credentials
                .findByDevice_DeviceIdAndCredentialTypeAndStatus(
                        deviceId, CredentialType.FINGERPRINT, CredentialStatus.ACTIVE)
                .stream()
                .map(c -> c.getLocalTemplateId().intValue())
                .collect(Collectors.toSet());
    }

    private int nextFreeSlot(Set<Integer> used) {
        return IntStream.rangeClosed(1, MAX_SLOT)
                .filter(slot -> !used.contains(slot))
                .findFirst()
                .orElseThrow(() -> new BusinessException(HttpStatus.CONFLICT, "Bộ nhớ vân tay của thiết bị đã đầy"));
    }
}
