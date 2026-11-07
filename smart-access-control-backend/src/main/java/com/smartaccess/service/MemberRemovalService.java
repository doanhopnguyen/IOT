package com.smartaccess.service;

import com.smartaccess.dto.manager.CommandResponse;
import com.smartaccess.exception.BusinessException;
import com.smartaccess.model.*;
import com.smartaccess.model.enumtype.*;
import com.smartaccess.repository.*;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Lazy;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.util.*;

/** A removal remains durable in commands until the sensor and local allowlists are verified empty. */
@Service
@Transactional
public class MemberRemovalService {
    public static final String COMMAND = "MEMBER_REMOVE";
    public static final String VERIFIED = "MEMBER_CREDENTIALS_REMOVED";
    private static final List<CommandStatus> UNFINISHED = List.of(CommandStatus.PENDING, CommandStatus.SENT,
            CommandStatus.FAILED, CommandStatus.TIMEOUT);
    private final DeviceRepository devices;
    private final DeviceInventoryRepository inventory;
    private final CommandRepository commands;
    private final DeviceCommandService dispatcher;
    private final CredentialRepository credentials;
    private final UserAccessRepository memberships;
    private final FaceRequestRepository faceRequests;
    private final AccessLogRepository logs;
    private final AuditLogRepository audits;
    private final MemberProfileService profiles;
    private final ApplicationEventPublisher events;

    public MemberRemovalService(DeviceRepository devices, DeviceInventoryRepository inventory, CommandRepository commands,
            @Lazy DeviceCommandService dispatcher, CredentialRepository credentials, UserAccessRepository memberships,
            FaceRequestRepository faceRequests, AccessLogRepository logs, AuditLogRepository audits,
            MemberProfileService profiles, ApplicationEventPublisher events) {
        this.devices=devices; this.inventory=inventory; this.commands=commands; this.dispatcher=dispatcher;
        this.credentials=credentials; this.memberships=memberships; this.faceRequests=faceRequests;
        this.logs=logs; this.audits=audits; this.profiles=profiles; this.events=events;
    }

    public CommandResponse start(AccessUnit unit, UserAccess member, Long actor) {
        Device d=devices.findFirstByAccessUnit_UnitIdAndDeviceType(unit.getUnitId(),DeviceType.DOOR_CONTROLLER)
                .orElseThrow(()->new BusinessException(HttpStatus.CONFLICT,"Cửa chưa có bộ điều khiển để xác nhận xóa"));
        d=devices.findByDeviceUidForUpdate(d.getDeviceUid()).orElseThrow();
        var item=inventory.findById(d.getDeviceId()).orElse(null);
        if(item!=null && "RESETTING".equals(item.getState()))
            throw new BusinessException(HttpStatus.CONFLICT,"Chờ cửa reset xong trước khi xóa thành viên");
        Long account=member.getAccount().getAccountId();
        var queued=pending(unit.getUnitId());
        for(Command existing:queued)
            if(number(existing.getPayload(),"accountId")==account.longValue()) return CommandResponse.from(existing);
        if(!queued.isEmpty())throw new BusinessException(HttpStatus.CONFLICT,"Cửa đang xóa một thành viên khác. Chờ xác nhận rồi thử lại");
        for(String type:List.of(FingerprintService.FP_ENROLL,FingerprintService.FP_DELETE))
            if(commands.existsByDevice_DeviceIdAndCommandTypeAndStatusIn(d.getDeviceId(),type,
                    List.of(CommandStatus.PENDING,CommandStatus.SENT)))
                throw new BusinessException(HttpStatus.CONFLICT,"Cảm biến đang xử lý vân tay. Chờ thao tác kết thúc rồi xóa thành viên");
        final Long deviceId=d.getDeviceId();
        List<Credential> owned=credentials.findByAccount_AccountId(account).stream()
                .filter(c->c.getDevice()!=null && deviceId.equals(c.getDevice().getDeviceId()))
                .filter(c->c.getCredentialType()==CredentialType.FINGERPRINT || c.getCredentialType()==CredentialType.RFID).toList();
        Set<Integer> protectedSlots=new HashSet<>();
        Set<String> protectedCards=new HashSet<>();
        for(CredentialType type:List.of(CredentialType.FINGERPRINT,CredentialType.RFID))
            for(Credential other:credentials.findByDevice_DeviceIdAndCredentialTypeAndStatus(deviceId,type,CredentialStatus.ACTIVE))
                if(!account.equals(other.getAccount().getAccountId())) {
                    if(other.getLocalTemplateId()!=null)protectedSlots.add(other.getLocalTemplateId().intValue());
                    if(other.getRfidUid()!=null)protectedCards.add(card(other.getRfidUid()));
                }
        List<Integer> slots=owned.stream().filter(c->c.getCredentialType()==CredentialType.FINGERPRINT && c.getLocalTemplateId()!=null)
                .map(c->c.getLocalTemplateId().intValue()).filter(s->s>0 && s<=255 && !protectedSlots.contains(s)).distinct().sorted().toList();
        boolean purgeFingerprints=!slots.isEmpty();
        // A timed-out enrollment may have stored a sensor template whose ACK never reached us.
        // Cancel late acceptance and let the chip remove occupied slots that have no other active owner.
        for(Command old:commands.findByDevice_AccessUnit_UnitIdAndCommandTypeAndStatusInOrderByCommandIdAsc(
                unit.getUnitId(),FingerprintService.FP_ENROLL,List.of(CommandStatus.TIMEOUT))) {
            if(number(old.getPayload(),"accountId")==account.longValue())purgeFingerprints=true;
            old.setStatus(CommandStatus.FAILED);old.setResultMessage("ENROLLMENT_CANCELLED_MEMBER_CLEANUP");
        }
        List<String> cards=owned.stream().filter(c->c.getCredentialType()==CredentialType.RFID && c.getRfidUid()!=null)
                .map(c->card(c.getRfidUid())).filter(s->s.matches("(?:[0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})") && !protectedCards.contains(s)).distinct().toList();
        // Deny access immediately, even if the chip is offline. Keep membership until verified ACK.
        member.setAllowFace(false); member.setAllowFingerprint(false); member.setAllowRfid(false); member.setAllowRemoteUnlock(false);
        for(Credential c:owned) { c.setStatus(CredentialStatus.REVOKED); c.setRevokedAt(LocalDateTime.now()); }
        long generation=item==null?0:item.getGeneration();
        Map<String,Object> wire=Map.of("fingerprints",slots,"rfid",cards,"generation",generation,
                "preserveFingerprints",protectedSlots.stream().sorted().toList(),"purgeFingerprints",purgeFingerprints);
        Map<String,Object> payload=new LinkedHashMap<>(wire);
        payload.put("unitId",unit.getUnitId()); payload.put("accountId",account);
        payload.put("credentialIds",owned.stream().map(Credential::getCredentialId).toList());
        Command command=dispatcher.dispatch(d,actor,COMMAND,payload,wire);
        events.publishEvent(new com.smartaccess.config.RealtimeConfig.DeviceUpdated());
        return CommandResponse.from(command);
    }

    @Transactional(readOnly=true)
    public Set<Long> pendingAccounts(Long unitId) {
        Set<Long> ids=new HashSet<>(); for(Command c:pending(unitId))ids.add(number(c.getPayload(),"accountId")); return ids;
    }
    public void requireNotRemoving(Long unitId,Long accountId) {
        if(pendingAccounts(unitId).contains(accountId))
            throw new BusinessException(HttpStatus.CONFLICT,"Thành viên đang được xóa. Chờ cửa xác nhận xóa dữ liệu");
    }
    public void requireNoCleanup(Device device) {
        if(!pending(device.getAccessUnit().getUnitId()).isEmpty())
            throw new BusinessException(HttpStatus.CONFLICT,"Cửa đang xóa dữ liệu thành viên. Chờ xác nhận trước khi đăng ký thẻ/vân tay");
    }
    @Transactional(readOnly=true)
    public List<Map<String,Object>> configuration(String uid,long generation) {
        Device d=devices.findByDeviceUid(uid).orElseThrow();
        if(d.getAccessUnit()==null)return List.of();
        return pending(d.getAccessUnit().getUnitId()).stream().filter(c->number(c.getPayload(),"generation")==generation)
                .map(c->Map.<String,Object>of("commandUuid",c.getCommandUuid(),"removalSequence",c.getCommandId(),
                        "fingerprints",c.getPayload().get("fingerprints"),"rfid",c.getPayload().get("rfid"),
                        "preserveFingerprints",c.getPayload().get("preserveFingerprints"),
                        "purgeFingerprints",c.getPayload().get("purgeFingerprints"))).toList();
    }
    @Transactional(readOnly=true)
    public Map<String,Object> wireData(String uuid) {
        Command c=commands.findByCommandUuid(uuid).orElseThrow();
        return Map.of("removalSequence",c.getCommandId());
    }

    public boolean acknowledge(String uid,String uuid,boolean success,String message) {
        Command c=commands.findForUpdate(uuid).orElse(null);
        if(c==null || !COMMAND.equals(c.getCommandType()) || !uid.equals(c.getDevice().getDeviceUid()))return false;
        if(c.getStatus()==CommandStatus.ACKNOWLEDGED)return true;
        if(!success || !VERIFIED.equals(message)) {
            c.setStatus(CommandStatus.SENT); c.setResultMessage(message==null?"Chờ thiết bị xác nhận xóa":message);
            return true; // Retry through authenticated heartbeat configuration, including after backend restarts.
        }
        Long unitId=number(c.getPayload(),"unitId"), accountId=number(c.getPayload(),"accountId");
        var key=new UserAccessId(accountId,unitId);
        UserAccess member=memberships.findById(key).orElse(null);
        List<Long> ids=((List<?>)c.getPayload().get("credentialIds")).stream().map(v->((Number)v).longValue()).toList();
        List<Credential> owned=credentials.findAllById(ids).stream()
                .filter(x->accountId.equals(x.getAccount().getAccountId()) && x.getDevice()!=null
                        && c.getDevice().getDeviceId().equals(x.getDevice().getDeviceId()))
                .filter(x->x.getCredentialType()==CredentialType.RFID || x.getCredentialType()==CredentialType.FINGERPRINT).toList();
        if(!owned.isEmpty()) {
            logs.detachCredentials(owned.stream().map(Credential::getCredentialId).toList());
            credentials.deleteAll(owned); credentials.flush();
        }
        faceRequests.deleteByAccount_AccountIdAndAccessUnit_UnitId(accountId,unitId); faceRequests.flush();
        String disposal="KEPT";
        if(member!=null) {
            boolean disposable=profiles.isDisposable(member.getAccessUnit(),accountId);
            memberships.delete(member); memberships.flush();
            if(disposable)disposal=profiles.dispose(member.getAccount()).name();
        }
        AuditLog audit=new AuditLog(); audit.setActor(c.getRequestedBy()); audit.setAction("REMOVE_USER_FROM_UNIT");
        audit.setEntityType("USER_ACCESS"); audit.setEntityId(accountId);
        audit.setDetails(Map.of("unitId",unitId,"accountId",accountId,"account",disposal,"commandUuid",uuid)); audits.save(audit);
        c.setPayload(Map.of("unitId",unitId,"accountId",accountId)); c.setStatus(CommandStatus.ACKNOWLEDGED);
        c.setAcknowledgedAt(LocalDateTime.now()); c.setResultMessage(VERIFIED);
        events.publishEvent(new com.smartaccess.config.RealtimeConfig.DeviceUpdated()); return true;
    }
    private List<Command> pending(Long unitId) {
        return commands.findByDevice_AccessUnit_UnitIdAndCommandTypeAndStatusInOrderByCommandIdAsc(unitId,COMMAND,UNFINISHED);
    }
    private static long number(Map<String,Object> data,String key) {return ((Number)data.get(key)).longValue();}
    private static String card(String uid) {return uid.replace(":","").replace("-","").toUpperCase(Locale.ROOT);}
}
