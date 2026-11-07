package com.smartaccess.service;

import com.smartaccess.exception.BusinessException;
import com.smartaccess.model.Account;
import com.smartaccess.model.AccessUnit;
import com.smartaccess.model.Device;
import com.smartaccess.model.UserAccess;
import com.smartaccess.model.enumtype.DeviceLifecycleStatus;
import com.smartaccess.model.enumtype.DeviceType;
import com.smartaccess.repository.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import java.util.Optional;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class MemberRemovalServiceTest {
    final DeviceRepository devices = mock(DeviceRepository.class);
    final DeviceCommandService dispatcher = mock(DeviceCommandService.class);
    final MemberRemovalService service = new MemberRemovalService(devices, mock(DeviceInventoryRepository.class),
            mock(CommandRepository.class), dispatcher, mock(CredentialRepository.class), mock(UserAccessRepository.class),
            mock(FaceRequestRepository.class), mock(AccessLogRepository.class), mock(AuditLogRepository.class),
            mock(MemberProfileService.class), mock(ApplicationEventPublisher.class));

    @ParameterizedTest
    @EnumSource(value = DeviceLifecycleStatus.class, names = {"MAINTENANCE", "SUSPENDED", "DECOMMISSIONED"})
    void startRejectedWhenControllerNotActive(DeviceLifecycleStatus status) {
        AccessUnit unit = new AccessUnit(); unit.setUnitId(3L);
        Device door = new Device(); door.setDeviceId(9L); door.setDeviceUid("door-9"); door.setLifecycleStatus(status);
        when(devices.findFirstByAccessUnit_UnitIdAndDeviceType(3L, DeviceType.DOOR_CONTROLLER)).thenReturn(Optional.of(door));
        when(devices.findByDeviceUidForUpdate("door-9")).thenReturn(Optional.of(door));
        Account account = new Account(); account.setAccountId(5L);
        UserAccess member = new UserAccess(); member.setAccount(account); member.setAllowRfid(true);

        assertThatThrownBy(() -> service.start(unit, member, 1L)).isInstanceOf(BusinessException.class)
                .hasMessage("Cửa đang bảo trì hoặc tạm ngưng; chưa xóa thành viên được")
                .extracting("status").isEqualTo(HttpStatus.CONFLICT);
        verifyNoInteractions(dispatcher);
        assertThat(member.isAllowRfid()).isTrue();
    }
}
