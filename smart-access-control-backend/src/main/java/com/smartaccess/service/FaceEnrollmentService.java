package com.smartaccess.service;

import com.smartaccess.dto.FaceDtos.*;
import com.smartaccess.model.*;
import com.smartaccess.model.enumtype.*;
import com.smartaccess.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.time.LocalDateTime;
import java.util.*;
import static org.springframework.http.HttpStatus.*;

@Service
@Transactional(readOnly = true)
public class FaceEnrollmentService {
    private final CurrentAccountService current;
    private final AccountRepository accounts;
    private final AccessUnitRepository units;
    private final UserAccessRepository memberships;
    private final FaceRequestRepository requests;
    private final CredentialRepository credentials;
    private final DeviceRepository devices;
    private final DeviceAuthenticationService authentication;
    private final AuditLogRepository audits;

    public FaceEnrollmentService(CurrentAccountService current, AccountRepository accounts, AccessUnitRepository units,
            UserAccessRepository memberships, FaceRequestRepository requests, CredentialRepository credentials,
            DeviceRepository devices, DeviceAuthenticationService authentication, AuditLogRepository audits) {
        this.current = current; this.accounts = accounts; this.units = units; this.memberships = memberships;
        this.requests = requests; this.credentials = credentials; this.devices = devices;
        this.authentication = authentication; this.audits = audits;
    }

    @Transactional
    public RequestView create(CreateRequest input) {
        Account actor = current.requireAccount();
        Long targetId = input.accountId() == null ? actor.getAccountId() : input.accountId();
        Account target = accounts.findForUpdate(targetId).orElseThrow(() -> error(NOT_FOUND, "Không tìm thấy tài khoản."));
        AccessUnit unit = units.findById(input.unitId()).orElseThrow(() -> error(NOT_FOUND, "Không tìm thấy cửa."));
        if (!input.consent()) throw error(BAD_REQUEST, "Cần có sự đồng ý rõ ràng trước khi đăng ký khuôn mặt.");
        if (!actor.getAccountId().equals(targetId) && !isManager(unit, actor.getAccountId()))
            throw error(FORBIDDEN, "Chỉ chủ tài khoản hoặc chủ cửa mới được đăng ký khuôn mặt.");
        if (!actor.getAccountId().equals(targetId) && credentials.findByAccount_AccountId(targetId).stream()
                .anyMatch(c -> c.getCredentialType() == CredentialType.FACE && c.getStatus() == CredentialStatus.ACTIVE))
            throw error(FORBIDDEN, "Chỉ chủ tài khoản mới được thay mẫu khuôn mặt dùng chung.");
        if (target.getStatus() != AccountStatus.ACTIVE) throw error(CONFLICT, "Tài khoản đã bị vô hiệu hóa.");
        // Khóa ngoại hiện có yêu cầu thành viên, kể cả khi chủ cửa đăng ký khuôn mặt của mình.
        if (!memberships.existsById(new UserAccessId(targetId, unit.getUnitId()))) {
            if (!isManager(unit, targetId)) throw error(FORBIDDEN, "Tài khoản chưa là thành viên của cửa này.");
            UserAccess ownerMembership = new UserAccess();
            ownerMembership.setAccount(target); ownerMembership.setAccessUnit(unit); ownerMembership.setAllowFace(true);
            memberships.saveAndFlush(ownerMembership);
        }
        List<FaceRequest> pending = requests.findByAccount_AccountIdAndStatusIn(targetId,
                List.of(FaceRequestStatus.PENDING, FaceRequestStatus.APPROVED));
        if (!pending.isEmpty()) throw error(CONFLICT, "Tài khoản đang có yêu cầu đăng ký khuôn mặt chưa hoàn tất.");
        byte[] embedding = FaceEmbedding.encode(input.model(), input.embedding());
        Credential sample = new Credential();
        sample.setAccount(target); sample.setCredentialType(CredentialType.FACE);
        sample.setStatus(CredentialStatus.PENDING); sample.setEmbeddingModel(FaceEmbedding.MODEL);
        sample.setFaceEmbedding(embedding); credentials.saveAndFlush(sample);
        FaceRequest request = new FaceRequest();
        request.setAccount(target); request.setAccessUnit(unit);
        request.setRequestType(active(targetId).isPresent() ? FaceRequestType.REENROLL : FaceRequestType.ENROLL);
        requests.saveAndFlush(request);
        audit(actor, "REQUEST_FACE_ENROLLMENT", request.getRequestId(), Map.of("accountId", targetId, "unitId", unit.getUnitId(), "consent", true, "credentialId", sample.getCredentialId()));
        return dto(request);
    }

    public List<RequestView> list(Long unitId) {
        Account actor = current.requireAccount();
        if (unitId == null) return requests.findByAccount_AccountIdOrderByRequestedAtDesc(actor.getAccountId()).stream().map(this::dto).toList();
        AccessUnit unit = units.findById(unitId).orElseThrow(() -> error(NOT_FOUND, "Không tìm thấy cửa."));
        return requests.findByAccessUnit_UnitIdOrderByRequestedAtDesc(unitId).stream()
                .filter(r -> isManager(unit, actor.getAccountId()) || actor.getAccountId().equals(r.getAccount().getAccountId()))
                .map(this::dto).toList();
    }

    @Transactional
    public RequestView decide(Long id, boolean approved) {
        Account actor = current.requireAccount();
        Long accountId = requests.findAccountIdByRequestId(id).orElseThrow(() -> error(NOT_FOUND, "Không tìm thấy yêu cầu đăng ký khuôn mặt."));
        Account target = accounts.findForUpdate(accountId).orElseThrow();
        FaceRequest request = lock(id);
        requireManager(request, actor.getAccountId());
        if (request.getStatus() != FaceRequestStatus.PENDING) throw error(CONFLICT, "Yêu cầu này đã được xử lý.");
        Credential sample = pendingSample(request).orElse(null);
        if (approved) {
            if (sample == null || sample.getStatus() != CredentialStatus.PENDING)
                throw error(CONFLICT, "Cần quét khuôn mặt trong ứng dụng trước khi duyệt; hãy hủy yêu cầu cũ chưa có mẫu.");
            if (target.getStatus() != AccountStatus.ACTIVE) throw error(CONFLICT, "Tài khoản đã bị vô hiệu hóa.");
            UserAccess membership = memberships.findById(new UserAccessId(accountId, request.getAccessUnit().getUnitId()))
                    .orElseThrow(() -> error(CONFLICT, "Tài khoản không còn là thành viên của cửa này."));
            FaceEmbedding.decode(sample.getFaceEmbedding());
            for (Credential old : credentials.findByAccount_AccountId(accountId)) {
                if (old.getCredentialType() == CredentialType.FACE && old.getStatus() == CredentialStatus.ACTIVE) {
                    old.setStatus(CredentialStatus.REVOKED); old.setRevokedAt(LocalDateTime.now());
                }
            }
            sample.setStatus(CredentialStatus.ACTIVE);
            membership.setAllowFace(true);
            request.setStatus(FaceRequestStatus.COMPLETED);
            request.setCompletedAt(LocalDateTime.now());
        } else {
            retirePending(sample);
            request.setStatus(FaceRequestStatus.REJECTED);
        }
        request.setReviewedAt(LocalDateTime.now());
        audit(actor, approved ? "APPROVE_FACE_ENROLLMENT" : "REJECT_FACE_ENROLLMENT", id, Map.of());
        return dto(request);
    }

    @Transactional
    public RequestView cancel(Long id) {
        Account actor = current.requireAccount();
        Long accountId = requests.findAccountIdByRequestId(id).orElseThrow(() -> error(NOT_FOUND, "Không tìm thấy yêu cầu đăng ký khuôn mặt."));
        accounts.findForUpdate(accountId).orElseThrow();
        FaceRequest request = lock(id);
        if (!actor.getAccountId().equals(request.getAccount().getAccountId()) && !isManager(request.getAccessUnit(), actor.getAccountId()))
            throw error(FORBIDDEN, "Cần là chủ tài khoản hoặc chủ cửa để thực hiện thao tác này.");
        if (request.getStatus() != FaceRequestStatus.PENDING && request.getStatus() != FaceRequestStatus.APPROVED)
            throw error(CONFLICT, "Chỉ có thể hủy yêu cầu đăng ký chưa hoàn tất.");
        retirePending(pendingSample(request).orElse(null));
        request.setStatus(FaceRequestStatus.REJECTED);
        request.setReviewedAt(LocalDateTime.now());
        audit(actor, "CANCEL_FACE_ENROLLMENT", id, Map.of());
        return dto(request);
    }

    public Profile profile() {
        return profileOf(current.requireAccount().getAccountId());
    }

    public Profile profileForManager(Long accountId, Long unitId) {
        Account actor = current.requireAccount();
        AccessUnit unit = units.findById(unitId).orElseThrow(() -> error(NOT_FOUND, "Không tìm thấy cửa."));
        if (!isManager(unit, actor.getAccountId()) && !actor.getAccountId().equals(accountId))
            throw error(FORBIDDEN, "Cần là chủ tài khoản hoặc chủ cửa để xem mẫu khuôn mặt.");
        if (!isManager(unit, accountId) && !memberships.existsById(new UserAccessId(accountId, unitId)))
            throw error(NOT_FOUND, "Tài khoản chưa là thành viên của cửa này.");
        return profileOf(accountId);
    }

    public Profile profileOf(Long accountId) {
        return active(accountId).map(c -> new Profile(true, c.getCredentialId(), c.getEmbeddingModel()))
                .orElse(new Profile(false, null, null));
    }

    @Transactional
    public void revoke() {
        Account actor = current.requireAccount();
        accounts.findForUpdate(actor.getAccountId()).orElseThrow();
        for (Credential credential : credentials.findByAccount_AccountId(actor.getAccountId())) {
            if (credential.getCredentialType() == CredentialType.FACE && (credential.getStatus() == CredentialStatus.ACTIVE || credential.getStatus() == CredentialStatus.PENDING)) {
                credential.setStatus(CredentialStatus.REVOKED); credential.setRevokedAt(LocalDateTime.now());
            }
        }
        for (FaceRequest request : requests.findByAccount_AccountIdAndStatusIn(actor.getAccountId(),
                List.of(FaceRequestStatus.PENDING, FaceRequestStatus.APPROVED))) {
            request.setStatus(FaceRequestStatus.REJECTED);
        }
        audit(actor, "REVOKE_FACE", actor.getAccountId(), Map.of());
    }

    @Transactional
    public void heartbeat(String uid, String secret) {
        Device device = node(uid, secret);
        device.setLifecycleStatus(DeviceLifecycleStatus.ACTIVE);
        device.setLastSeenAt(LocalDateTime.now());
        devices.save(device);
    }

    public Templates templates(String uid, String secret) {
        Device device = node(uid, secret);
        AccessUnit unit = device.getAccessUnit();
        List<Template> result = new ArrayList<>();
        if (unit.isFaceEnabled()) {
            Set<Long> allowed = new HashSet<>();
            for (UserAccess membership : memberships.findMembersByUnitId(unit.getUnitId()))
                if (membership.isAllowFace() && membership.getAccount().getStatus() == AccountStatus.ACTIVE)
                    allowed.add(membership.getAccount().getAccountId());
            if (unit.getManager() != null && unit.getManager().getStatus() == AccountStatus.ACTIVE)
                allowed.add(unit.getManager().getAccountId());
            for (Long accountId : allowed)
                active(accountId).ifPresent(c -> result.add(new Template(c.getCredentialId(), accountId, FaceEmbedding.decode(c.getFaceEmbedding()))));
        }
        return new Templates(FaceEmbedding.MODEL, result);
    }

    private Optional<Credential> pendingSample(FaceRequest request) {
        return audits.findFirstByActionAndEntityTypeAndEntityIdOrderByAuditLogIdDesc(
                "REQUEST_FACE_ENROLLMENT", "FACE_REQUEST", request.getRequestId())
                .map(log -> log.getDetails().get("credentialId"))
                .filter(Number.class::isInstance).map(Number.class::cast)
                .flatMap(value -> credentials.findById(value.longValue()))
                .filter(c -> c.getCredentialType() == CredentialType.FACE
                        && c.getAccount().getAccountId().equals(request.getAccount().getAccountId())
                        && FaceEmbedding.MODEL.equals(c.getEmbeddingModel()));
    }

    private static void retirePending(Credential sample) {
        if (sample != null && sample.getStatus() == CredentialStatus.PENDING) {
            sample.setStatus(CredentialStatus.REVOKED); sample.setRevokedAt(LocalDateTime.now());
        }
    }

    private Device node(String uid, String secret) {
        Device device = authentication.authenticate(uid, secret);
        if (device.getDeviceType() != DeviceType.FACE_CAMERA_NODE) throw error(FORBIDDEN, "Thiết bị này không phải node camera nhận diện khuôn mặt.");
        return device;
    }

    private Optional<Credential> active(Long id) {
        return credentials.findByAccount_AccountId(id).stream()
                .filter(c -> c.getCredentialType() == CredentialType.FACE && c.getStatus() == CredentialStatus.ACTIVE
                        && FaceEmbedding.MODEL.equals(c.getEmbeddingModel()))
                .max(Comparator.comparing(Credential::getCredentialId));
    }

    private FaceRequest lock(Long id) {
        return requests.findForUpdate(id).orElseThrow(() -> error(NOT_FOUND, "Không tìm thấy yêu cầu đăng ký khuôn mặt."));
    }

    private static boolean isManager(AccessUnit unit, Long id) {
        return unit.getManager() != null && id.equals(unit.getManager().getAccountId());
    }

    private static void requireManager(FaceRequest request, Long id) {
        if (!isManager(request.getAccessUnit(), id)) throw error(FORBIDDEN, "Chỉ chủ cửa mới được xử lý yêu cầu này.");
    }

    private RequestView dto(FaceRequest request) {
        return new RequestView(request.getRequestId(), request.getAccount().getAccountId(), request.getAccount().getFullName(),
                request.getAccessUnit().getUnitId(), request.getAccessUnit().getUnitName(), request.getStatus().name(),
                request.getRequestedAt());
    }

    private void audit(Account actor, String action, Long id, Map<String, Object> details) {
        AuditLog audit = new AuditLog(); audit.setActor(actor); audit.setAction(action);
        audit.setEntityType("FACE_REQUEST"); audit.setEntityId(id); audit.setDetails(details); audits.save(audit);
    }

    private static ResponseStatusException error(org.springframework.http.HttpStatus status, String message) {
        return new ResponseStatusException(status, message);
    }
}
