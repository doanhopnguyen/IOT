package com.smartaccess.service;

import com.smartaccess.dto.manager.CommandResponse;
import com.smartaccess.model.Command;
import com.smartaccess.model.enumtype.CommandStatus;
import com.smartaccess.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;
import static org.springframework.http.HttpStatus.*;

@Service
public class EnrollmentService {
    public static final String CANCEL="ENROLLMENT_CANCEL";
    public static final String CANCELLED="ENROLLMENT_CANCELLED";
    public static final String COMPLETED="ENROLLMENT_ALREADY_COMPLETED";
    private final ManagerAccessGuard guard;
    private final DeviceRepository devices;
    private final CommandRepository repository;
    private final DeviceCommandService commands;
    public EnrollmentService(ManagerAccessGuard guard, DeviceRepository devices, CommandRepository repository, DeviceCommandService commands) {
        this.guard=guard; this.devices=devices; this.repository=repository; this.commands=commands;
    }
    @Transactional(readOnly=true)
    public CommandResponse current(Long actor, Long unitId, Long userId) {
        guard.requireManagedUnit(actor,unitId);
        var device=devices.findFirstByAccessUnit_UnitIdAndDeviceType(unitId,com.smartaccess.model.enumtype.DeviceType.DOOR_CONTROLLER).orElse(null);
        if(device==null) return null;
        return repository.findFirstByDevice_DeviceIdAndCommandTypeInAndStatusInOrderByCommandIdDesc(
                device.getDeviceId(),List.of("RFID_SCAN","FP_ENROLL"),List.of(CommandStatus.values()))
                .filter(c -> c.getRequestedBy()!=null && actor.equals(c.getRequestedBy().getAccountId()))
                .filter(c -> c.getPayload().get("accountId") instanceof Number id && id.longValue()==userId)
                .filter(c -> c.getRequestedAt().isAfter(java.time.LocalDateTime.now().minusSeconds(120)))
                .map(CommandResponse::from).orElse(null);
    }
    @Transactional
    public CommandResponse cancel(Long actor, Long unitId, String uuid) {
        guard.requireManagedUnit(actor,unitId);
        var found=repository.findByCommandUuid(uuid).orElseThrow(() -> new ResponseStatusException(NOT_FOUND));
        var device=devices.findByDeviceUidForUpdate(found.getDevice().getDeviceUid()).orElseThrow();
        var target=repository.findForUpdate(uuid).orElseThrow();
        if(device.getAccessUnit()==null || !unitId.equals(device.getAccessUnit().getUnitId()) ||
                target.getRequestedBy()==null || !actor.equals(target.getRequestedBy().getAccountId()) ||
                !Set.of("RFID_SCAN","FP_ENROLL").contains(target.getCommandType())) throw new ResponseStatusException(NOT_FOUND);
        // A fingerprint already committed by the reader belongs to the completed enrollment. Never erase it on cancel.
        if(target.getStatus()==CommandStatus.ACKNOWLEDGED && "FP_ENROLL".equals(target.getCommandType()))
            return new CommandResponse(uuid, CommandStatus.ACKNOWLEDGED, COMPLETED);
        if(target.getPayload().get("credentialId")!=null)
            return new CommandResponse(uuid, CommandStatus.ACKNOWLEDGED, COMPLETED);
        if(CANCELLED.equals(target.getResultMessage()))
            return new CommandResponse(uuid, CommandStatus.ACKNOWLEDGED, CANCELLED);
        Object previous=target.getPayload().get("cancelCommandUuid");
        if(previous instanceof String id) {
            var pending=repository.findByCommandUuid(id).orElse(null);
            if(pending!=null && List.of(CommandStatus.PENDING,CommandStatus.SENT).contains(pending.getStatus()))
                return CommandResponse.from(pending);
        }
        var payload=new HashMap<>(target.getPayload());
        String cancelUuid=UUID.randomUUID().toString();
        payload.put("cancelRequested",true); payload.put("cancelCommandUuid",cancelUuid);
        target.setPayload(payload);
        return CommandResponse.from(commands.dispatchWithUuid(device,actor,CANCEL,
                Map.of("targetCommandUuid",uuid),Map.of("targetCommandUuid",uuid,"targetType",target.getCommandType(),
                        "targetSequence",target.getCommandId()),cancelUuid));
    }
}
