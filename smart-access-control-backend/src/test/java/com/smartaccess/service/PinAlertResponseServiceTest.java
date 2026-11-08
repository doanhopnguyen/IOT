package com.smartaccess.service;

import com.smartaccess.model.*;
import com.smartaccess.model.enumtype.*;
import com.smartaccess.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class PinAlertResponseServiceTest {
    final EventRepository events=mock(EventRepository.class);
    final CurrentAccountService current=mock(CurrentAccountService.class);
    final ManagerAccessGuard guard=mock(ManagerAccessGuard.class);
    final DeviceRepository devices=mock(DeviceRepository.class);
    final DeviceInventoryRepository inventory=mock(DeviceInventoryRepository.class);
    final CommandRepository commands=mock(CommandRepository.class);
    final DeviceCommandService dispatcher=mock(DeviceCommandService.class);
    final LockdownService lockdown=mock(LockdownService.class);
    final PinAlertResponseService service=new PinAlertResponseService(events,current,guard,devices,inventory,commands,dispatcher,lockdown,mock(jakarta.persistence.EntityManager.class));
    Account owner;Event alert;Device device;AccessUnit unit;Command created;
    @BeforeEach void seed(){
        owner=new Account();owner.setAccountId(1L);when(current.requireAccount()).thenReturn(owner);
        unit=new AccessUnit();unit.setUnitId(7L);unit.setManager(owner);
        device=new Device();device.setDeviceId(3L);device.setDeviceUid("ESP-PIN");device.setAccessUnit(unit);
        alert=new Event();alert.setEventId(9L);alert.setDevice(device);alert.setEventType(AlertRuleService.REPEATED_WRONG_PIN);alert.setAlertStatus(AlertStatus.OPEN);
        when(events.findById(9L)).thenReturn(Optional.of(alert));when(guard.requireOnlineController(7L)).thenReturn(device);
        DeviceInventory item=new DeviceInventory();item.setGeneration(4);when(inventory.findById(3L)).thenReturn(Optional.of(item));
        created=new Command();created.setCommandUuid("response");created.setStatus(CommandStatus.PENDING);
        when(dispatcher.dispatch(any(),anyLong(),anyString(),anyMap(),anyMap())).thenReturn(created);
    }
    @Test void bothActionsDispatchWithoutResolvingBeforeDeviceAcknowledges(){
        for(var action:PinAlertResponseService.Action.values()){
            service.respond(9L,action);
            verify(dispatcher).dispatch(device,1L,"PIN_ALERT_"+action,Map.of("unitId",7L,"generation",4L,"pinAlertId",9L),Map.of());
            assertThat(alert.getAlertStatus()).isEqualTo(AlertStatus.OPEN);
        }
    }
    @Test void ownerCanRetryTheSamePendingChoiceWithoutSendingItAgain(){
        created.setCommandType(PinAlertResponseService.SAFE);created.setPayload(Map.of("pinAlertId",9));
        when(commands.findFirstByDevice_DeviceIdAndCommandTypeInAndStatusInOrderByCommandIdDesc(eq(3L),eq(List.of(PinAlertResponseService.SAFE)),anyList())).thenReturn(Optional.of(created));
        assertThat(service.respond(9L,PinAlertResponseService.Action.SAFE).commandUuid()).isEqualTo("response");
        assertThatThrownBy(()->service.respond(9L,PinAlertResponseService.Action.LOCKDOWN)).isInstanceOf(RuntimeException.class);
        verifyNoInteractions(dispatcher);
    }
    @Test void memberCannotRespond(){
        Account member=new Account();member.setAccountId(2L);when(current.requireAccount()).thenReturn(member);
        assertThatThrownBy(()->service.respond(9L,PinAlertResponseService.Action.SAFE)).isInstanceOf(RuntimeException.class);
        verifyNoInteractions(dispatcher);
    }
    @Test void resolvedAndUnrelatedAlertsRejectCommands(){
        alert.setAlertStatus(AlertStatus.RESOLVED);
        assertThatThrownBy(()->service.respond(9L,PinAlertResponseService.Action.SAFE)).isInstanceOf(RuntimeException.class);
        alert.setAlertStatus(AlertStatus.OPEN);alert.setEventType(AlertRuleService.DOOR_LEFT_OPEN);
        assertThatThrownBy(()->service.respond(9L,PinAlertResponseService.Action.LOCKDOWN)).isInstanceOf(RuntimeException.class);
        verifyNoInteractions(dispatcher);
    }
    @Test void offlineAndExistingLockdownAreNotSilentlyReleased(){
        when(guard.requireOnlineController(7L)).thenThrow(new IllegalStateException("offline"));
        assertThatThrownBy(()->service.respond(9L,PinAlertResponseService.Action.SAFE)).hasMessage("offline");
        doReturn(device).when(guard).requireOnlineController(7L);when(lockdown.isLockedDown(device)).thenReturn(true);
        assertThatThrownBy(()->service.respond(9L,PinAlertResponseService.Action.SAFE)).isInstanceOf(RuntimeException.class);
        verifyNoInteractions(dispatcher);
    }
}
