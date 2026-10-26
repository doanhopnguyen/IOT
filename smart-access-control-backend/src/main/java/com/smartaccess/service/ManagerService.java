package com.smartaccess.service;

import com.smartaccess.dto.manager.*;
import com.smartaccess.exception.BusinessException;
import com.smartaccess.model.*;
import com.smartaccess.model.enumtype.AccountStatus;
import com.smartaccess.model.enumtype.DeviceLifecycleStatus;
import com.smartaccess.repository.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

@Service
@Transactional(readOnly = true)
public class ManagerService {
    private final AccountRepository accounts;
    private final AccessUnitRepository units;
    private final UserAccessRepository memberships;
    private final DeviceRepository devices;
    private final AuditLogRepository audits;
    private final FaceRequestRepository faceRequests;
    private final MemberProfileService memberProfiles;

    public ManagerService(AccountRepository accounts, AccessUnitRepository units,
            UserAccessRepository memberships, DeviceRepository devices, AuditLogRepository audits,
            FaceRequestRepository faceRequests, MemberProfileService memberProfiles) {
        this.accounts = accounts;
        this.units = units;
        this.memberships = memberships;
        this.devices = devices;
        this.audits = audits;
        this.faceRequests = faceRequests;
        this.memberProfiles = memberProfiles;
    }

    public List<UserSearchResponse> searchUsers(Long managerId, String keyword, String type) {
        Account manager = requireAccount(managerId, "Manager not found");
        if (!units.existsByManager_AccountId(manager.getAccountId())) {
            throw new BusinessException(HttpStatus.FORBIDDEN, "Account does not manage an access unit");
        }
        if (keyword == null || keyword.isBlank() || keyword.length() > 254) {
            throw new BusinessException(HttpStatus.BAD_REQUEST, "Search keyword is required and must be at most 254 characters");
        }
        String value = keyword.trim();
        String searchType = type == null ? "auto" : type.trim().toLowerCase(Locale.ROOT);
        Optional<Account> match = switch (searchType) {
            case "account" -> accounts.findById(parseAccountId(value));
            case "email" -> accounts.findByEmailIgnoreCase(value);
            case "auto" -> value.matches("[0-9]+")
                    ? accounts.findById(parseAccountId(value)) : accounts.findByEmailIgnoreCase(value);
            default -> throw new BusinessException(HttpStatus.BAD_REQUEST, "Search type must be account, email or auto");
        };
        return match.map(UserSearchResponse::from).stream().toList();
    }

    public List<UnitUserResponse> getUsers(Long managerId, Long unitId) {
        validateManagerAccess(managerId, unitId, false);
        // Đăng ký khuôn mặt cho chủ cửa dùng một quan hệ thành viên nội bộ để đáp ứng khóa ngoại cũ.
        List<UserAccess> members = memberships.findMembersByUnitId(unitId).stream()
                .filter(m -> !m.getAccount().getAccountId().equals(managerId)).toList();
        Map<Long, MemberProfileService.ProfileInfo> profiles = memberProfiles.describe(unitId, members);
        return members.stream().map(member -> toResponse(member, profiles)).toList();
    }

    /** Thêm người chưa có ứng dụng: tạo tài khoản tối thiểu (mật khẩu mặc định 123456) rồi thêm thẳng vào cửa. */
    @Transactional
    public UnitUserResponse createMemberProfile(Long managerId, Long unitId, CreateMemberProfileRequest request) {
        AccessUnit unit = validateManagerAccess(managerId, unitId, true);
        UserAccess membership = memberProfiles.create(unit, request);
        return UnitUserResponse.from(membership, request.room(), false, true);
    }

    @Transactional
    public DeviceResponse registerDevice(Long managerId, Long unitId, RegisterDeviceRequest request) {
        AccessUnit unit = validateManagerAccess(managerId, unitId, true);
        String code = request == null ? null : request.deviceCode();
        if (code == null || code.isBlank() || code.length() > 64) {
            throw new BusinessException(HttpStatus.BAD_REQUEST, "Device code is required and must be at most 64 characters");
        }
        Device device = devices.findByDeviceUidForUpdate(code.trim())
                .orElseThrow(() -> new BusinessException(HttpStatus.NOT_FOUND, "Device not found"));
        if (device.getAccessUnit() != null) {
            String message = unitId.equals(device.getAccessUnit().getUnitId())
                    ? "Device already belongs to this unit" : "Device already belongs to another unit";
            throw new BusinessException(HttpStatus.CONFLICT, message);
        }
        if (device.getLifecycleStatus() == DeviceLifecycleStatus.SUSPENDED
                || device.getLifecycleStatus() == DeviceLifecycleStatus.DECOMMISSIONED
                || device.getLifecycleStatus() == DeviceLifecycleStatus.MAINTENANCE) {
            throw new BusinessException(HttpStatus.CONFLICT, "Device lifecycle status does not permit registration");
        }
        device.setAccessUnit(unit);
        devices.save(device);
        audit(unit.getManager(), "REGISTER_DEVICE", "DEVICE", device.getDeviceId(),
                Map.of("unitId", unitId, "deviceId", device.getDeviceId()));
        return DeviceResponse.from(device);
    }

    /** Manager thêm thẳng thành viên (không có bảng lời mời); người đó có thể là manager của cửa khác. */
    @Transactional
    public UnitUserResponse addUser(Long managerId, Long unitId, Long userId) {
        AccessUnit unit = validateManagerAccess(managerId, unitId, true);
        Account user = requireAccount(userId, "User not found");
        if (user.isAdmin()) {
            throw new BusinessException(HttpStatus.FORBIDDEN, "Cannot add an admin account to an access unit");
        }
        if (user.getStatus() != AccountStatus.ACTIVE) {
            throw new BusinessException(HttpStatus.CONFLICT, "User account is not active");
        }
        if (isManagerOf(unit, userId)) {
            throw new BusinessException(HttpStatus.CONFLICT, "Manager already owns this access unit");
        }
        if (memberships.existsById(new UserAccessId(userId, unitId))) {
            throw new BusinessException(HttpStatus.CONFLICT, "User already belongs to this access unit");
        }
        UserAccess membership = new UserAccess();
        membership.setAccount(user);
        membership.setAccessUnit(unit);
        membership.setAllowFingerprint(true);
        membership.setAllowRfid(true);
        membership.setAllowRemoteUnlock(true);
        memberships.saveAndFlush(membership);
        audit(unit.getManager(), "ADD_USER_TO_UNIT", "USER_ACCESS", userId,
                Map.of("unitId", unitId, "accountId", userId));
        return UnitUserResponse.from(membership);
    }

    @Transactional
    public UnitUserResponse updatePermissions(Long managerId, Long unitId, Long userId, PermissionRequest request) {
        AccessUnit unit = validateManagerAccess(managerId, unitId, true);
        UserAccess membership = requireManagedMember(unit, userId, HttpStatus.CONFLICT);
        if (request == null || request.isEmpty()) {
            throw new BusinessException(HttpStatus.BAD_REQUEST, "At least one permission is required");
        }
        Map<String, Object> before = permissionValues(membership);
        if (request.allowFace() != null) { membership.setAllowFace(request.allowFace()); }
        if (request.allowFingerprint() != null) { membership.setAllowFingerprint(request.allowFingerprint()); }
        if (request.allowRfid() != null) { membership.setAllowRfid(request.allowRfid()); }
        if (request.allowRemoteUnlock() != null) { membership.setAllowRemoteUnlock(request.allowRemoteUnlock()); }
        Map<String, Object> after = permissionValues(membership);
        if (!before.equals(after)) {
            memberships.save(membership);
            audit(unit.getManager(), "UPDATE_PERMISSION", "USER_ACCESS", userId,
                    Map.of("unitId", unitId, "accountId", userId, "before", before, "after", after));
        }
        return toResponse(membership, memberProfiles.describe(unitId, List.of(membership)));
    }

    @Transactional
    public void removeUser(Long managerId, Long unitId, Long userId) {
        AccessUnit unit = validateManagerAccess(managerId, unitId, true);
        UserAccess membership = requireManagedMember(unit, userId, HttpStatus.NOT_FOUND);
        if (faceRequests.existsByAccount_AccountIdAndAccessUnit_UnitId(userId, unitId)) {
            throw new BusinessException(HttpStatus.CONFLICT,
                    "Cannot remove membership with face request history in current schema; revoke permissions instead");
        }
        // Tài khoản do chủ cửa này tạo mà người đó chưa từng đăng nhập thì xóa (hoặc ẩn) theo luôn.
        boolean disposeAccount = memberProfiles.isDisposable(unit, userId);
        Account user = membership.getAccount();
        memberships.delete(membership);
        memberships.flush(); // Detect restrictive FK conflicts before recording success.
        MemberProfileService.Disposal disposal = disposeAccount
                ? memberProfiles.dispose(user) : MemberProfileService.Disposal.KEPT;
        audit(unit.getManager(), "REMOVE_USER_FROM_UNIT", "USER_ACCESS", userId,
                Map.of("unitId", unitId, "accountId", userId, "account", disposal.name()));
    }

    private UnitUserResponse toResponse(UserAccess member, Map<Long, MemberProfileService.ProfileInfo> profiles) {
        MemberProfileService.ProfileInfo profile = profiles.get(member.getAccount().getAccountId());
        return profile == null ? UnitUserResponse.from(member)
                : UnitUserResponse.from(member, profile.room(), profile.hasLoggedIn(), profile.deletableAccount());
    }

    // Manager của cửa khác vẫn là thành viên bình thường ở cửa này; chỉ chặn admin và chủ chính cửa này.
    private UserAccess requireManagedMember(AccessUnit unit, Long userId, HttpStatus missingMembershipStatus) {
        Account user = requireAccount(userId, "User not found");
        UserAccess membership = memberships.findById(new UserAccessId(userId, unit.getUnitId()))
                .orElseThrow(() -> new BusinessException(missingMembershipStatus, "User does not belong to this access unit"));
        if (user.isAdmin() || isManagerOf(unit, userId)) {
            throw new BusinessException(HttpStatus.FORBIDDEN, "Manager cannot modify an admin or this unit manager's membership");
        }
        return membership;
    }

    private boolean isManagerOf(AccessUnit unit, Long accountId) {
        return unit.getManager() != null && accountId.equals(unit.getManager().getAccountId());
    }

    private Map<String, Object> permissionValues(UserAccess membership) {
        return Map.of("allowFace", membership.isAllowFace(), "allowFingerprint", membership.isAllowFingerprint(),
                "allowRfid", membership.isAllowRfid(), "allowRemoteUnlock", membership.isAllowRemoteUnlock());
    }

    private AccessUnit validateManagerAccess(Long managerId, Long unitId, boolean lock) {
        requireAccount(managerId, "Manager not found");
        requirePositiveId(unitId);
        AccessUnit unit = (lock ? units.findForUpdate(unitId) : units.findById(unitId))
                .orElseThrow(() -> new BusinessException(HttpStatus.NOT_FOUND, "Access unit not found"));
        if (unit.getManager() == null || !managerId.equals(unit.getManager().getAccountId())) {
            throw new BusinessException(HttpStatus.FORBIDDEN, "Manager does not manage this access unit");
        }
        return unit;
    }

    private Account requireAccount(Long accountId, String message) {
        requirePositiveId(accountId);
        return accounts.findById(accountId)
                .orElseThrow(() -> new BusinessException(HttpStatus.NOT_FOUND, message));
    }

    private void requirePositiveId(Long id) {
        if (id == null || id <= 0) {
            throw new BusinessException(HttpStatus.BAD_REQUEST, "Identifiers must be positive integers");
        }
    }

    private Long parseAccountId(String value) {
        try {
            Long id = Long.valueOf(value);
            requirePositiveId(id);
            return id;
        } catch (NumberFormatException exception) {
            throw new BusinessException(HttpStatus.BAD_REQUEST, "Account search requires a numeric accountId");
        }
    }

    private void audit(Account actor, String action, String entityType, Long entityId, Map<String, Object> details) {
        AuditLog audit = new AuditLog();
        audit.setActor(actor);
        audit.setAction(action);
        audit.setEntityType(entityType);
        audit.setEntityId(entityId);
        audit.setDetails(details);
        audits.save(audit);
    }
}
