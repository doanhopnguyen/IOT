package com.smartaccess.service;
import com.smartaccess.dto.manager.CommandResponse;
import com.smartaccess.model.enumtype.CommandStatus;
import com.smartaccess.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;
import static org.springframework.http.HttpStatus.*;

@Service
public class RfidScanService {
    private final ManagerAccessGuard guard;
    private final DeviceRepository devices;
    private final DeviceCommandService commands;
    private final CommandRepository repository;
    private final MemberRemovalService removals;
    public RfidScanService(ManagerAccessGuard guard,DeviceRepository devices,DeviceCommandService commands,CommandRepository repository,MemberRemovalService removals) {
        this.guard=guard; this.devices=devices; this.commands=commands; this.repository=repository;
        this.removals=removals;
    }
    @Transactional
    public CommandResponse start(Long actor,Long unitId,Long userId) {
        guard.requireManagedUnit(actor,unitId); guard.requireUserOfUnit(userId,unitId);
        var online=guard.requireOnlineController(unitId);
        var device=devices.findByDeviceUidForUpdate(online.getDeviceUid()).orElseThrow();
        removals.requireNoCleanup(device);
        for(String type:List.of("RFID_SCAN","FP_ENROLL")) {
            if(repository.existsByDevice_DeviceIdAndCommandTypeAndStatusIn(device.getDeviceId(),type,List.of(CommandStatus.PENDING,CommandStatus.SENT)))
                throw new ResponseStatusException(CONFLICT,"Cửa đang có phiên đăng ký thẻ/vân tay. Chờ hoàn tất rồi thử lại.");
        }
        return CommandResponse.from(commands.dispatch(device,actor,"RFID_SCAN",Map.of("accountId",userId,"unitId",unitId),Map.of()));
    }
}
