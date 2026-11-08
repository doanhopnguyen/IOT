package com.smartaccess.service;

import com.smartaccess.dto.manager.CommandResponse;
import com.smartaccess.exception.BusinessException;
import com.smartaccess.model.*;
import com.smartaccess.model.enumtype.*;
import com.smartaccess.repository.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.Map;

@Service
public class PinAlertResponseService {
    public static final String SAFE="PIN_ALERT_SAFE", LOCKDOWN="PIN_ALERT_LOCKDOWN";
    public enum Action { SAFE, LOCKDOWN }
    private static final List<String> RESPONSES=List.of(SAFE,LOCKDOWN);
    private static final List<CommandStatus> IN_FLIGHT=List.of(CommandStatus.PENDING,CommandStatus.SENT);
    private final EventRepository events;
    private final CurrentAccountService current;
    private final ManagerAccessGuard guard;
    private final DeviceRepository devices;
    private final DeviceInventoryRepository inventory;
    private final CommandRepository commands;
    private final DeviceCommandService dispatcher;
    private final LockdownService lockdown;
    private final jakarta.persistence.EntityManager entityManager;
    public PinAlertResponseService(EventRepository events,CurrentAccountService current,ManagerAccessGuard guard,
            DeviceRepository devices,DeviceInventoryRepository inventory,CommandRepository commands,
            DeviceCommandService dispatcher,LockdownService lockdown,jakarta.persistence.EntityManager entityManager){
        this.events=events;this.current=current;this.guard=guard;this.devices=devices;
        this.inventory=inventory;this.commands=commands;this.dispatcher=dispatcher;this.lockdown=lockdown;
        this.entityManager=entityManager;
    }
    @Transactional
    public CommandResponse respond(Long id,Action action){
        Account actor=current.requireAccount();
        Event alert=events.findById(id).orElseThrow(()->new BusinessException(HttpStatus.NOT_FOUND,"Không tìm thấy cảnh báo"));
        AccessUnit unit=alert.getDevice().getAccessUnit();
        if(unit==null || unit.getManager()==null || !actor.getAccountId().equals(unit.getManager().getAccountId()))
            throw new BusinessException(HttpStatus.FORBIDDEN,"Chỉ chủ cửa được xử lý cảnh báo PIN");
        if(action==null || !AlertRuleService.REPEATED_WRONG_PIN.equals(alert.getEventType()))
            throw new BusinessException(HttpStatus.BAD_REQUEST,"Lựa chọn này chỉ dùng cho cảnh báo nhập sai PIN");
        Device device=guard.requireOnlineController(unit.getUnitId());
        devices.findByDeviceUidForUpdate(device.getDeviceUid());
        entityManager.refresh(alert); // An ACK may have completed while this request waited for the device lock.
        if(!device.getDeviceId().equals(alert.getDevice().getDeviceId()))
            throw new BusinessException(HttpStatus.CONFLICT,"Thiết bị của cửa đã thay đổi");
        if(alert.getAlertStatus()!=AlertStatus.OPEN && alert.getAlertStatus()!=AlertStatus.ACKNOWLEDGED)
            throw new BusinessException(HttpStatus.CONFLICT,"Cảnh báo đã được xử lý");
        String type=action==Action.SAFE?SAFE:LOCKDOWN;
        for(String response:RESPONSES){
            var pending=commands.findFirstByDevice_DeviceIdAndCommandTypeInAndStatusInOrderByCommandIdDesc(
                    device.getDeviceId(),List.of(response),IN_FLIGHT);
            if(pending.isPresent()){
                Command command=pending.get();
                if(type.equals(command.getCommandType()) && command.getPayload()!=null &&
                        command.getPayload().get("pinAlertId") instanceof Number n && n.longValue()==id)
                    return CommandResponse.from(command);
                throw new BusinessException(HttpStatus.CONFLICT,"Cửa đang xử lý một lựa chọn trước đó");
            }
        }
        for(String pending:List.of(LockdownService.DOOR_LOCKDOWN,LockdownService.DOOR_RELEASE))
            if(commands.existsByDevice_DeviceIdAndCommandTypeAndStatusIn(device.getDeviceId(),pending,IN_FLIGHT))
                throw new BusinessException(HttpStatus.CONFLICT,"Cửa đang xử lý lệnh tạm khóa");
        if(action==Action.SAFE && lockdown.isLockedDown(device))
            throw new BusinessException(HttpStatus.CONFLICT,"Cửa đang tạm khóa. Gỡ tạm khóa trong cài đặt cửa trước khi cho nhập PIN trở lại.");
        long generation=inventory.findById(device.getDeviceId()).map(DeviceInventory::getGeneration).orElse(0L);
        return CommandResponse.from(dispatcher.dispatch(device,actor.getAccountId(),type,
                Map.of("unitId",unit.getUnitId(),"generation",generation,"pinAlertId",id),Map.of()));
    }
}
