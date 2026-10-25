package com.smartaccess.service;

import com.smartaccess.dto.manager.CreateMemberProfileRequest;
import com.smartaccess.exception.BusinessException;
import com.smartaccess.model.*;
import com.smartaccess.model.enumtype.AccountStatus;
import com.smartaccess.model.enumtype.CredentialStatus;
import com.smartaccess.model.enumtype.CredentialType;
import com.smartaccess.repository.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Tài khoản tối thiểu do chủ cửa tạo cho người chưa có ứng dụng.
 * Schema không có cột đánh dấu nên dùng audit_logs: CREATE_MEMBER_PROFILE (kèm unitId, room) và FIRST_LOGIN.
 */
@Service
@Transactional(readOnly = true)
public class MemberProfileService {
    public static final String CREATE_ACTION = "CREATE_MEMBER_PROFILE";
    public static final String FIRST_LOGIN_ACTION = "FIRST_LOGIN";
    public static final String DEFAULT_PASSWORD = "123456";
    private static final String ACCOUNT = "ACCOUNT";

    public enum Disposal { KEPT, DELETED, HIDDEN }

    /** Thông tin bổ sung cho một thành viên do chủ cửa tạo. */
    public record ProfileInfo(String room, boolean hasLoggedIn, boolean deletableAccount) {}

    private final AccountRepository accounts;
    private final AccessUnitRepository units;
    private final UserAccessRepository memberships;
    private final CredentialRepository credentials;
    private final AccessLogRepository accessLogs;
    private final AuditLogRepository audits;
    private final PasswordEncoder passwords;

    public MemberProfileService(AccountRepository accounts, AccessUnitRepository units, UserAccessRepository memberships,
            CredentialRepository credentials, AccessLogRepository accessLogs, AuditLogRepository audits,
            PasswordEncoder passwords) {
        this.accounts = accounts;
        this.units = units;
        this.memberships = memberships;
        this.credentials = credentials;
        this.accessLogs = accessLogs;
        this.audits = audits;
        this.passwords = passwords;
    }

    @Transactional
    public UserAccess create(AccessUnit unit, CreateMemberProfileRequest request) {
        if (request == null || request.fullName() == null || request.fullName().isBlank() || request.fullName().length() > 100) {
            throw new BusinessException(HttpStatus.BAD_REQUEST, "Full name is required and must be at most 100 characters");
        }
        if (request.room() != null && request.room().length() > 50) {
            throw new BusinessException(HttpStatus.BAD_REQUEST, "Room must be at most 50 characters");
        }
        Account profile = new Account();
        profile.setFullName(request.fullName());
        String contact = request.contact() == null ? "" : request.contact();
        if (contact.contains("@")) {
            String email = contact.toLowerCase(Locale.ROOT);
            if (email.length() > 254 || !email.matches("[^@\\s]+@[^@\\s]+\\.[^@\\s]+")) {
                throw new BusinessException(HttpStatus.BAD_REQUEST, "Email is invalid");
            }
            if (accounts.findByEmailIgnoreCase(email).isPresent()) { throw contactTaken(); }
            profile.setEmail(email);
        } else {
            if (!contact.matches("\\+?[0-9]{8,15}")) {
                throw new BusinessException(HttpStatus.BAD_REQUEST, "Phone or email is required; phone must have 8-15 digits");
            }
            if (accounts.existsByPhone(contact)) { throw contactTaken(); }
            profile.setPhone(contact);
        }
        profile.setPasswordHash(passwords.encode(DEFAULT_PASSWORD));
        profile.setAdmin(false);
        profile.setStatus(AccountStatus.ACTIVE);
        accounts.saveAndFlush(profile); // Trùng contact do chạy song song → GlobalExceptionHandler trả 409.

        UserAccess membership = new UserAccess();
        membership.setAccount(profile);
        membership.setAccessUnit(unit);
        membership.setAllowFingerprint(true);
        membership.setAllowRfid(true);
        membership.setAllowRemoteUnlock(false); // Chưa có ứng dụng thì không mở từ xa.
        memberships.saveAndFlush(membership);

        Map<String, Object> details = new LinkedHashMap<>();
        details.put("unitId", unit.getUnitId());
        details.put("createdBy", unit.getManager().getAccountId());
        details.put("room", request.room());
        audit(unit.getManager(), CREATE_ACTION, profile.getAccountId(), details);
        return membership;
    }

    /** Thông tin hồ sơ của các thành viên cửa unitId; thành viên tự đăng ký không có trong map. */
    public Map<Long, ProfileInfo> describe(Long unitId, Collection<UserAccess> members) {
        Set<Long> ids = members.stream().map(member -> member.getAccount().getAccountId()).collect(Collectors.toSet());
        if (ids.isEmpty()) { return Map.of(); }
        List<AuditLog> created = audits.findByActionAndEntityTypeAndEntityIdIn(CREATE_ACTION, ACCOUNT, ids);
        if (created.isEmpty()) { return Map.of(); }
        Set<Long> loggedIn = audits.findByActionAndEntityTypeAndEntityIdIn(FIRST_LOGIN_ACTION, ACCOUNT,
                        created.stream().map(AuditLog::getEntityId).toList())
                .stream().map(AuditLog::getEntityId).collect(Collectors.toSet());
        Map<Long, ProfileInfo> result = new HashMap<>();
        for (AuditLog audit : created) {
            Long accountId = audit.getEntityId();
            boolean hasLoggedIn = loggedIn.contains(accountId);
            boolean createdHere = unitId.equals(unitIdOf(audit));
            result.put(accountId, new ProfileInfo(roomOf(audit), hasLoggedIn, createdHere && !hasLoggedIn));
        }
        return result;
    }

    /** Gọi khi đăng nhập thành công: lần đầu thì ghi FIRST_LOGIN, từ đó tài khoản không bị xóa theo cửa nữa. */
    @Transactional
    public void recordLogin(Account account) {
        Long id = account.getAccountId();
        if (audits.existsByActionAndEntityTypeAndEntityId(CREATE_ACTION, ACCOUNT, id)
                && !audits.existsByActionAndEntityTypeAndEntityId(FIRST_LOGIN_ACTION, ACCOUNT, id)) {
            audit(account, FIRST_LOGIN_ACTION, id, Map.of());
        }
    }

    /**
     * Gọi trước khi gỡ userId khỏi cửa. true nếu sau khi gỡ phải xóa/ẩn luôn tài khoản: do chủ cửa này tạo,
     * chưa đăng nhập, không ở cửa khác và không quản lý cửa nào. Còn vân tay trên thiết bị thì báo 409.
     */
    public boolean isDisposable(AccessUnit unit, Long userId) {
        Optional<AuditLog> created = audits.findFirstByActionAndEntityTypeAndEntityIdOrderByAuditLogIdDesc(
                CREATE_ACTION, ACCOUNT, userId);
        if (created.isEmpty() || !unit.getUnitId().equals(unitIdOf(created.get()))
                || audits.existsByActionAndEntityTypeAndEntityId(FIRST_LOGIN_ACTION, ACCOUNT, userId)
                || units.existsByManager_AccountId(userId)
                || memberships.findByAccountWithUnit(userId).stream()
                        .anyMatch(member -> !unit.getUnitId().equals(member.getAccessUnit().getUnitId()))) {
            return false;
        }
        if (credentials.existsByAccount_AccountIdAndCredentialTypeAndStatus(userId, CredentialType.FINGERPRINT,
                CredentialStatus.ACTIVE)) {
            throw new BusinessException(HttpStatus.CONFLICT,
                    "Delete this member's fingerprints from the device before removing the member");
        }
        return true;
    }

    /** Gọi sau khi đã xóa user_access. Có lịch sử ra vào (FK RESTRICT) thì ẩn tài khoản, ngược lại xóa hẳn. */
    @Transactional
    public Disposal dispose(Account user) {
        Long id = user.getAccountId();
        List<Credential> owned = credentials.findByAccount_AccountId(id);
        if (accessLogs.existsByAccount_AccountId(id)) {
            LocalDateTime now = LocalDateTime.now().truncatedTo(ChronoUnit.MILLIS);
            for (Credential credential : owned) {
                if (credential.getStatus() == CredentialStatus.ACTIVE) {
                    credential.setStatus(CredentialStatus.REVOKED);
                    credential.setRevokedAt(now);
                }
            }
            credentials.saveAll(owned);
            // Giữ họ tên để lịch sử vẫn hiện đúng; bỏ SĐT/email để người đó đăng ký lại được.
            user.setStatus(AccountStatus.DISABLED);
            user.setPhone(null);
            user.setEmail("deleted-" + id + "@noapp.local");
            accounts.saveAndFlush(user);
            return Disposal.HIDDEN;
        }
        credentials.deleteAll(owned);
        credentials.flush();
        accounts.delete(user);
        accounts.flush();
        return Disposal.DELETED;
    }

    private BusinessException contactTaken() {
        return new BusinessException(HttpStatus.CONFLICT,
                "An account with this phone or email already exists; add it as an existing app user");
    }

    private Long unitIdOf(AuditLog audit) {
        Object value = audit.getDetails() == null ? null : audit.getDetails().get("unitId");
        return value instanceof Number number ? number.longValue() : null;
    }

    private String roomOf(AuditLog audit) {
        Object value = audit.getDetails() == null ? null : audit.getDetails().get("room");
        return value instanceof String room ? room : null;
    }

    private void audit(Account actor, String action, Long entityId, Map<String, Object> details) {
        AuditLog audit = new AuditLog();
        audit.setActor(actor);
        audit.setAction(action);
        audit.setEntityType(ACCOUNT);
        audit.setEntityId(entityId);
        audit.setDetails(details);
        audits.save(audit);
    }
}
