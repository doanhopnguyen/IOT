package com.smartaccess.service;

import com.smartaccess.dto.unit.UnitSettings;
import com.smartaccess.exception.BusinessException;
import com.smartaccess.model.AccessUnit;
import com.smartaccess.model.AuditLog;
import com.smartaccess.repository.AccountRepository;
import com.smartaccess.repository.AuditLogRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import java.util.Map;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class UnitSettingsServiceTest {
    final ManagerAccessGuard guard = mock(ManagerAccessGuard.class);
    final AuditLogRepository audits = mock(AuditLogRepository.class);
    final ApplicationEventPublisher notifications = mock(ApplicationEventPublisher.class);
    final UnitSettingsService service = new UnitSettingsService(guard, audits, mock(AccountRepository.class), notifications);
    AccessUnit unit;

    @BeforeEach void setup() {
        unit = new AccessUnit(); unit.setUnitId(3L);
        when(guard.requireManagedUnit(1L, 3L)).thenReturn(unit);
    }

    @Test void outOfRangeValuesAreRejectedAndNothingChanges() {
        for (var bad : new UnitSettings.Request[] {
                new UnitSettings.Request(0, null, null, null, null), new UnitSettings.Request(31, null, null, null, null),
                new UnitSettings.Request(null, 9, null, null, null), new UnitSettings.Request(null, 601, null, null, null)}) {
            assertThatThrownBy(() -> service.update(1L, 3L, bad)).isInstanceOfSatisfying(BusinessException.class,
                    e -> assertThat(e.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST));
        }
        assertThat(unit.getUnlockDurationSec()).isEqualTo((short) 5);
        assertThat(unit.getDoorOpenTimeoutSec()).isEqualTo((short) 60);
        verifyNoInteractions(audits);
    }

    @Test void partialUpdateKeepsOtherFields() {
        var result = service.update(1L, 3L, new UnitSettings.Request(null, 120, null, false, null));
        assertThat(result).isEqualTo(new UnitSettings.Response(5, 120, true, false, true));
        assertThat(unit.getDoorOpenTimeoutSec()).isEqualTo((short) 120);
        assertThat(unit.isRfidEnabled()).isFalse();
    }

    @SuppressWarnings("unchecked")
    @Test void auditStoresBeforeAndAfterAndNotifiesClients() {
        service.update(1L, 3L, new UnitSettings.Request(10, null, null, null, null));
        var captor = ArgumentCaptor.forClass(AuditLog.class);
        verify(audits).save(captor.capture());
        assertThat(captor.getValue().getAction()).isEqualTo("UPDATE_UNIT_SETTINGS");
        assertThat((Map<String, Object>) captor.getValue().getDetails().get("before")).containsEntry("unlockDurationSec", 5);
        assertThat((Map<String, Object>) captor.getValue().getDetails().get("after")).containsEntry("unlockDurationSec", 10);
        verify(notifications).publishEvent(any(Object.class));
    }

    @Test void foreignManagerIs403() {
        when(guard.requireManagedUnit(2L, 3L)).thenThrow(new BusinessException(HttpStatus.FORBIDDEN, "no"));
        assertThatThrownBy(() -> service.update(2L, 3L, new UnitSettings.Request(10, null, null, null, null)))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getStatus()).isEqualTo(HttpStatus.FORBIDDEN));
        assertThat(unit.getUnlockDurationSec()).isEqualTo((short) 5);
    }

    @Test void emptyRequestIs400() {
        assertThatThrownBy(() -> service.update(1L, 3L, new UnitSettings.Request(null, null, null, null, null)))
                .isInstanceOf(BusinessException.class);
    }
}
