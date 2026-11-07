package com.smartaccess.service;

import com.smartaccess.dto.manager.RegisterDeviceRequest;
import com.smartaccess.dto.unit.CreateUnitRequest;
import com.smartaccess.dto.unit.UnitResponse;
import com.smartaccess.exception.BusinessException;
import com.smartaccess.model.AccessUnit;
import com.smartaccess.model.Device;
import com.smartaccess.model.UserAccess;
import com.smartaccess.model.UserAccessId;
import com.smartaccess.model.enumtype.DeviceLifecycleStatus;
import com.smartaccess.model.enumtype.DeviceType;
import com.smartaccess.repository.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/** Cửa của tài khoản đang đăng nhập: cửa mình quản lý (OWNER) và cửa mình là thành viên (USER). */
@Service
@Transactional(readOnly = true)
public class UnitService {
    @org.springframework.beans.factory.annotation.Autowired(required=false)
    private DeviceInventoryRepository inventory;
    private final AccountRepository accounts;
    private final AccessUnitRepository units;
    private final UserAccessRepository memberships;
    private final DeviceRepository devices;
    private final FaceRequestRepository faceRequests;
    private final ManagerService managerService;

    public UnitService(AccountRepository accounts, AccessUnitRepository units, UserAccessRepository memberships,
            DeviceRepository devices, FaceRequestRepository faceRequests, ManagerService managerService) {
        this.accounts = accounts;
        this.units = units;
        this.memberships = memberships;
        this.devices = devices;
        this.faceRequests = faceRequests;
        this.managerService = managerService;
    }

    public List<UnitResponse> listMine(Long accountId) {
        List<UnitResponse> result = new ArrayList<>();
        for (AccessUnit unit : units.findByManager_AccountIdOrderByUnitId(accountId)) {
            result.add(toResponse(unit, "OWNER", true));
        }
        for (UserAccess membership : memberships.findByAccountWithUnit(accountId)) {
            if (membership.getAccessUnit().getManager() != null
                    && accountId.equals(membership.getAccessUnit().getManager().getAccountId())) continue;
            result.add(toResponse(membership.getAccessUnit(), "USER",
                    membership.isAllowRemoteUnlock()));
        }
        return result;
    }

    @Transactional
    public UnitResponse create(Long accountId, CreateUnitRequest request) {
        AccessUnit unit = new AccessUnit();
        unit.setManager(accounts.getReferenceById(accountId));
        unit.setUnitName(request.unitName().trim());
        units.saveAndFlush(unit);
        // Lỗi thiết bị (không tồn tại, đã thuộc cửa khác) sẽ rollback luôn cửa vừa tạo
        managerService.registerDevice(accountId, unit.getUnitId(), new RegisterDeviceRequest(request.deviceCode()));
        return toResponse(unit, "OWNER", true);
    }

    @Transactional
    public void leave(Long accountId, Long unitId) {
        UserAccess membership = memberships.findById(new UserAccessId(accountId, unitId))
                .orElseThrow(() -> new BusinessException(HttpStatus.NOT_FOUND, "Bạn không phải thành viên của cửa này"));
        if (faceRequests.existsByAccount_AccountIdAndAccessUnit_UnitId(accountId, unitId)) {
            throw new BusinessException(HttpStatus.CONFLICT,
                    "Không thể rời cửa khi đã có lịch sử yêu cầu khuôn mặt; hãy nhờ manager thu hồi quyền");
        }
        memberships.delete(membership);
        memberships.flush();
    }

    private UnitResponse toResponse(AccessUnit unit, String role, boolean canRemoteUnlock) {
        Device device = devices.findFirstByAccessUnit_UnitIdAndDeviceType(unit.getUnitId(), DeviceType.DOOR_CONTROLLER)
                .orElse(null);
        LocalDateTime lastSeen = device == null ? null : device.getLastSeenAt();
        boolean online = device != null && device.getLifecycleStatus() == DeviceLifecycleStatus.ACTIVE
                && lastSeen != null
                && lastSeen.isAfter(LocalDateTime.now().minusSeconds(ManagerAccessGuard.ONLINE_WINDOW_SEC));
        long memberCount = memberships.countByAccessUnit_UnitId(unit.getUnitId());
        if (unit.getManager() != null && memberships.existsById(new UserAccessId(unit.getManager().getAccountId(), unit.getUnitId())))
            memberCount = Math.max(0, memberCount - 1);
        var state=inventory==null||device==null?null:inventory.findById(device.getDeviceId()).orElse(null);
        return new UnitResponse(unit.getUnitId(), unit.getUnitName(), role, online,
                memberCount, canRemoteUnlock && unit.isRemoteUnlockEnabled() && (state==null||state.isSetupReady()) && (state==null||!state.getState().equals("RESETTING")), lastSeen,
                online&&state!=null?state.getDoorClosed():null,online&&state!=null?state.getLatchReleased():null,
                state==null?null:state.getState(),device==null?null:device.getDeviceUid(),
                canRemoteUnlock && (state==null||state.isSetupReady()) && (state==null||!state.getState().equals("RESETTING")));
    }
}
