package com.smartaccess.service;

import com.smartaccess.model.*;
import com.smartaccess.model.enumtype.*;
import com.smartaccess.repository.*;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.EntityManager;
import com.smartaccess.config.RealtimeConfig;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.time.LocalDateTime;
import java.security.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import static org.springframework.http.HttpStatus.*;

/** Inventory/claim/reset are serialized per physical device, independently of admin UI. */
@Service @Transactional
public class DeploymentService {
    public record InventoryView(Long deviceId,String deviceUid,String factoryMac,String name,Long unitId,
        String owner,String state,long generation,boolean setupReady,Boolean doorClosed,Boolean latchReleased,
        LocalDateTime lastSeenAt,String operationUuid) {}
    public record Issued(InventoryView device,String activationCode,String deviceSecret,String setupSsid,String setupPassword,
                         com.smartaccess.dto.manager.CommandResponse syncCommand) {
        public Issued(InventoryView device,String activationCode,String deviceSecret,String setupSsid,String setupPassword){this(device,activationCode,deviceSecret,setupSsid,setupPassword,null);}
    }
    public record ClaimPreview(String deviceUid,String name,boolean online) {}
    private final DeviceInventoryRepository inventory;
    private final DeviceRepository devices;
    private final AccessUnitRepository units;
    private final AccountRepository accounts;
    private final CurrentAccountService current;
    private final PasswordEncoder passwords;
    private final ManagerAccessGuard guard;
    private final DeviceCommandService commands;
    private final CommandRepository commandRows;
    private final ApplicationEventPublisher events;
    private final EntityManager em;
    public static final String RESET_COMMAND="DEVICE_RESET";
    public static final String SYNC_ACTIVATION="ACTIVATION_CODE_SET";
    private static final String RESET_VERIFIED="RESET_EMPTY_VERIFIED";
    private static final int AUDIT_PAGE=500;
    public DeploymentService(DeviceInventoryRepository inventory,DeviceRepository devices,AccessUnitRepository units,
        AccountRepository accounts,CurrentAccountService current,PasswordEncoder passwords,ManagerAccessGuard guard,
        DeviceCommandService commands,CommandRepository commandRows,ApplicationEventPublisher events,EntityManager em) {
        this.inventory=inventory;this.devices=devices;this.units=units;this.accounts=accounts;
        this.current=current;this.passwords=passwords;this.guard=guard;this.commands=commands;
        this.commandRows=commandRows;this.events=events;this.em=em;
    }
    public static String digest(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
    private static String token() { byte[] b=new byte[24];new SecureRandom().nextBytes(b);return Base64.getUrlEncoder().withoutPadding().encodeToString(b); }
    private static ResponseStatusException error(org.springframework.http.HttpStatus s,String m) {return new ResponseStatusException(s,m);}
    private Account admin() { Account a=current.requireAccount();if(!a.isAdmin()) throw error(FORBIDDEN,"Admin hệ thống required");return a; }
    private void reauthenticate(Account a,String password) {
        if(password==null || !passwords.matches(password,a.getPasswordHash())) throw error(FORBIDDEN,"Cần xác thực lại mật khẩu tài khoản");
    }
    public Issued register(String mac,String name) {
        admin();
        mac=mac.replace(":","").replace("-","").toUpperCase(Locale.ROOT);
        if(!mac.matches("[0-9A-F]{12}") || name==null || name.isBlank() || name.length()>100) throw error(BAD_REQUEST,"Factory MAC/tên không hợp lệ");
        if(inventory.findByFactoryMac(mac).isPresent()) throw error(CONFLICT,"Chip này đã được đăng ký");
        String uid="ESP32-"+mac;
        if(devices.existsByDeviceUid(uid)) throw error(CONFLICT,"Device UID đã tồn tại");
        String secret=token(),code=token();
        Device d=new Device();d.setDeviceUid(uid);d.setDeviceName(name.trim());d.setDeviceType(DeviceType.DOOR_CONTROLLER);
        d.setDeviceSecretHash(passwords.encode(secret));d.setBootstrapSecretHash(passwords.encode(token()));
        devices.saveAndFlush(d);
        DeviceInventory i=new DeviceInventory();i.setDevice(d);i.setFactoryMac(mac);i.setClaimHash(digest(code));
        inventory.saveAndFlush(i);
        return new Issued(view(i),code,secret,"SmartDoor-"+mac.substring(6),token().substring(0,12));
    }
    public List<InventoryView> list() { admin();return inventory.findAll().stream().map(this::view).toList(); }
    public long generation(String uid) {
        return devices.findByDeviceUid(uid).flatMap(d->inventory.findById(d.getDeviceId())).map(DeviceInventory::getGeneration).orElse(0L);
    }
    public List<InventoryView> mine() {
        Long id=current.requireAccount().getAccountId();
        return inventory.findAll().stream().filter(i -> i.getDevice().getAccessUnit()!=null &&
            i.getDevice().getAccessUnit().getManager()!=null && id.equals(i.getDevice().getAccessUnit().getManager().getAccountId()))
            .map(this::view).toList();
    }
    public ClaimPreview inspect(String code) {
        Account actor=current.requireAccount();
        if(code==null || code.length()<24 || code.length()>128)throw error(BAD_REQUEST,"Mã nhận cửa không hợp lệ");
        DeviceInventory i=inventory.claimForUpdate(digest(code.trim())).orElseThrow(()->error(NOT_FOUND,"Mã không hợp lệ hoặc đã dùng"));
        if(!"INVENTORY".equals(i.getState()) || i.getDevice().getAccessUnit()!=null)throw error(CONFLICT,"Cửa đã được nhận");
        if(i.getRecipientId()!=null && !i.getRecipientId().equals(actor.getAccountId()))throw error(FORBIDDEN,"Mã dành cho người nhận bàn giao");
        return new ClaimPreview(i.getDevice().getDeviceUid(),i.getDevice().getDeviceName(),online(i.getDevice()));
    }
    private boolean online(Device d) {
        return d.getLifecycleStatus()==DeviceLifecycleStatus.ACTIVE && d.getLastSeenAt()!=null
                && d.getLastSeenAt().isAfter(LocalDateTime.now().minusSeconds(90));
    }
    public InventoryView claim(String code,String name) {
        Account actor=current.requireAccount();
        if(code==null || code.length()<24 || code.length()>128 || name==null || name.isBlank() || name.length()>100) throw error(BAD_REQUEST,"Mã nhận cửa/tên không hợp lệ");
        DeviceInventory i=inventory.claimForUpdate(digest(code.trim())).orElseThrow(()->error(NOT_FOUND,"Mã không hợp lệ hoặc đã dùng"));
        Device d=i.getDevice();
        if(!i.getState().equals("INVENTORY") || d.getAccessUnit()!=null) throw error(CONFLICT,"Cửa đã được nhận");
        if(i.getRecipientId()!=null && !i.getRecipientId().equals(actor.getAccountId())) throw error(FORBIDDEN,"Mã dành cho tài khoản nhận bàn giao");
        if(!online(d))throw error(CONFLICT,"Cần kết nối Wi-Fi và chờ cửa online với dịch vụ trước khi nhận cửa");
        AccessUnit u=new AccessUnit();u.setManager(actor);u.setUnitName(name.trim());units.saveAndFlush(u);
        d.setAccessUnit(u);d.setLifecycleStatus(DeviceLifecycleStatus.PROVISIONED);
        UserAccess member=new UserAccess();member.setAccount(actor);member.setAccessUnit(u);
        member.setAllowFingerprint(true);member.setAllowRfid(true);member.setAllowRemoteUnlock(true);em.persist(member);
        i.setClaimHash(null);i.setState("CLAIMED");i.setSetupReady(false);return view(i);
    }
    public InventoryView status(String uid) {
        Device d=devices.findByDeviceUid(uid).orElseThrow(()->error(NOT_FOUND,"Device not found"));
        DeviceInventory i=inventory.findById(d.getDeviceId()).orElseThrow();
        Account a=current.requireAccount();
        if(!Objects.equals(i.getOperationActorId(),a.getAccountId()) && !Objects.equals(i.getRecipientId(),a.getAccountId()))requireOwnerOrAdmin(d);
        return view(i);
    }
    private Account requireOwnerOrAdmin(Device d) {
        Account a=current.requireAccount();AccessUnit u=d.getAccessUnit();
        if(!a.isAdmin() && (u==null || u.getManager()==null || !u.getManager().getAccountId().equals(a.getAccountId()))) throw error(FORBIDDEN,"Chỉ chủ cửa hoặc admin");
        return a;
    }
    public InventoryView startReset(String uid,String password,String adminPin,String confirmation,String recipientEmail) {
        Device d=devices.findByDeviceUidForUpdate(uid).orElseThrow(()->error(NOT_FOUND,"Device not found"));
        Account a=requireOwnerOrAdmin(d);reauthenticate(a,password);
        if(!d.isLocalAdminPinEnabled() || d.getLocalAdminPinHash()==null)
            throw error(CONFLICT,"Cửa chưa xác nhận PIN admin từ app; cần hoàn tất bước đặt PIN trước khi reset");
        if(adminPin==null || !adminPin.matches("[0-9]{6}") || !passwords.matches(adminPin,d.getLocalAdminPinHash()))
            throw error(FORBIDDEN,"PIN admin của cửa chưa đúng");
        if(!uid.equals(confirmation)) throw error(BAD_REQUEST,"Nhập đúng device UID để xác nhận xóa");
        DeviceInventory i=inventory.lock(d.getDeviceId()).orElseThrow();
        if(i.getState().equals("RESETTING")) return view(i);
        if(d.getAccessUnit()==null) throw error(CONFLICT,"Cửa chưa được kích hoạt; không có dữ liệu chủ để reset");
        guard.requireOnlineController(d.getAccessUnit().getUnitId());
        if(recipientEmail!=null && !recipientEmail.isBlank()) {
            Account receiver=accounts.findByEmailIgnoreCase(recipientEmail.trim()).filter(x->x.getStatus()==AccountStatus.ACTIVE)
                .orElseThrow(()->error(NOT_FOUND,"Người nhận cần có tài khoản đang hoạt động"));
            i.setRecipientId(receiver.getAccountId());
        } else i.setRecipientId(null);
        String uuid=UUID.randomUUID().toString();i.setOperationUuid(uuid);i.setOperationActorId(a.getAccountId());i.setOperationGeneration(i.getGeneration());i.setState("RESETTING");
        commands.dispatchWithUuid(d,a.getAccountId(),RESET_COMMAND,Map.of("unitId",d.getAccessUnit().getUnitId()),
            Map.of("generation",i.getGeneration(),"nextGeneration",i.getGeneration()+1),uuid);
        return view(i);
    }
    public Map<String,Object> wireConfig(String uid,JsonNode state) {
        Device d=devices.findByDeviceUidForUpdate(uid).orElseThrow();
        DeviceInventory i=inventory.lock(d.getDeviceId()).orElse(null);
        if(i==null) return Map.of();
        if(state.path("generation").asLong(-1)!=i.getGeneration()) return Map.of("generation",i.getGeneration(),"generationMismatch",true);
        // Chỉ báo client làm mới khi trạng thái người dùng thấy được thay đổi, không phải mỗi heartbeat.
        List<Object> before=Arrays.asList(i.getDoorClosed(),i.getLatchReleased(),i.getState(),i.isSetupReady());
        if(state.has("doorClosed"))i.setDoorClosed(state.hasNonNull("doorClosed")?state.path("doorClosed").asBoolean():null);
        if(state.has("unlocked"))i.setLatchReleased(state.hasNonNull("unlocked")?state.path("unlocked").asBoolean():null);
        i.setStateUpdatedAt(LocalDateTime.now());
        boolean localReady=state.path("localReady").asBoolean(false);
        if(state.has("servoCalibrated"))localReady=localReady && state.path("servoCalibrated").asBoolean(false);
        if(state.path("hasDoorPin").asBoolean(false) && d.getAccessUnit()!=null)d.getAccessUnit().setPinEnabled(true);
        if(i.getState().equals("CLAIMED") || i.getState().equals("ACTIVE")) {
            boolean ready=localReady && d.getAccessUnit()!=null && d.getAccessUnit().isPinEnabled();
            i.setSetupReady(ready);i.setState(ready?"ACTIVE":"CLAIMED");
        }
        if(!before.equals(Arrays.asList(i.getDoorClosed(),i.getLatchReleased(),i.getState(),i.isSetupReady())))
            events.publishEvent(new RealtimeConfig.DeviceUpdated());
        Map<String,Object> out=new LinkedHashMap<>();out.put("generation",i.getGeneration());
        out.put("activationState",i.getState());out.put("claimed",d.getAccessUnit()!=null);
        if(i.getState().equals("RESETTING"))out.put("resetCommand",i.getOperationUuid());
        return out;
    }
    public boolean acceptGeneration(Device d,JsonNode message) {
        DeviceInventory i=inventory.findById(d.getDeviceId()).orElse(null);
        if(i==null)return true;
        long gen=message.path("generation").asLong(-1);
        if(gen==i.getGeneration())return true;
        // Ack thất bại không thay đổi dữ liệu, nên vẫn nhận để lệnh bị firmware từ chối
        // (ví dụ GENERATION_MISMATCH) chuyển FAILED thay vì treo SENT; handleAck kiểm tra lệnh thuộc thiết bị.
        if(message.hasNonNull("commandUuid") && message.has("success") && !message.path("success").asBoolean(true))return true;
        return message.has("commandUuid") && Objects.equals(i.getOperationUuid(),message.path("commandUuid").asText())
            && Objects.equals(i.getOperationGeneration(),gen);
    }
    /**
     * Trả true khi ack đã được xử lý trọn vẹn tại đây (gateway gửi ack-confirm, bỏ qua handleAck).
     * Reset thất bại hoặc thiếu bằng chứng thì đưa cửa về CLAIMED thay vì kẹt RESETTING; operationUuid được giữ
     * để một ack RESET_EMPTY_VERIFIED đến muộn (thiết bị thật sự đã xóa) vẫn hoàn tất được việc dọn dữ liệu.
     */
    public boolean resetAck(String uid,JsonNode message) {
        Device d=devices.findByDeviceUidForUpdate(uid).orElseThrow();
        DeviceInventory i=inventory.lock(d.getDeviceId()).orElse(null);
        String uuid=message.path("commandUuid").asText();
        if(i==null || !Objects.equals(i.getOperationUuid(),uuid))return false;
        if(i.getState().equals("INVENTORY"))return true; // Idempotent late ACK after a committed cleanup.
        if(!message.path("success").asBoolean()) {abortReset(i);return false;}
        if(!RESET_VERIFIED.equals(message.path("message").asText())) {
            abortReset(i);failCommand(uuid,"Reset chưa có bằng chứng xóa đầy đủ");return true;
        }
        if(!Set.of("RESETTING","CLAIMED","ACTIVE").contains(i.getState()))return false;
        AccessUnit u=d.getAccessUnit();Long unitId=u==null?null:u.getUnitId();
        if(unitId!=null) {
            var requestIds=em.createQuery("select r.requestId from FaceRequest r where r.accessUnit.unitId=:id",Long.class).setParameter("id",unitId).getResultList();
            var credentialIds=em.createQuery("select c.credentialId from Credential c where c.device.accessUnit.unitId=:id",Long.class).setParameter("id",unitId).getResultList();
            deleteLinkedAudits(u,new HashSet<>(requestIds),new HashSet<>(credentialIds));
            em.createQuery("delete from DoorInvitation i where i.unit.unitId=:id").setParameter("id",unitId).executeUpdate();
            // Delete in FK order, preserving global accounts/FACE profiles and other doors.
            em.createQuery("delete from AccessLog l where l.accessUnit.unitId=:id").setParameter("id",unitId).executeUpdate();
            em.createQuery("delete from FaceRequest r where r.accessUnit.unitId=:id").setParameter("id",unitId).executeUpdate();
            var deviceIds=em.createQuery("select x.deviceId from Device x where x.accessUnit.unitId=:id",Long.class).setParameter("id",unitId).getResultList();
            em.createQuery("delete from Credential c where c.device.deviceId in :ids").setParameter("ids",deviceIds).executeUpdate();
            em.createQuery("delete from Command c where c.device.deviceId in :ids").setParameter("ids",deviceIds).executeUpdate();
            em.createQuery("delete from Event e where e.device.deviceId in :ids").setParameter("ids",deviceIds).executeUpdate();
            em.createQuery("delete from Telemetry t where t.device.deviceId in :ids").setParameter("ids",deviceIds).executeUpdate();
            em.createQuery("delete from AuditLog a where (a.entityType='ACCESS_UNIT' and a.entityId=:id) or (a.entityType='DEVICE' and a.entityId in :ids)")
                .setParameter("id",unitId).setParameter("ids",deviceIds).executeUpdate();
            em.createQuery("delete from UserAccess m where m.accessUnit.unitId=:id").setParameter("id",unitId).executeUpdate();
            for(Long deviceId:deviceIds) {
                Device item=devices.findById(deviceId).orElseThrow();item.setAccessUnit(null);
                item.setLocalAdminPinEnabled(false);item.setLocalAdminPinHash(null);
                item.setLifecycleStatus(DeviceLifecycleStatus.REGISTERED);item.setLastSeenAt(null);
            }
            em.flush();units.delete(u);em.flush();
        }
        i.setGeneration(i.getGeneration()+1);i.setSetupReady(false);i.setDoorClosed(null);i.setLatchReleased(null);i.setState("INVENTORY");i.setClaimHash(null);
        return true;
    }
    /** Gọi khi lệnh DEVICE_RESET bị đánh TIMEOUT: thiết bị không phản hồi thì cửa không được kẹt ở RESETTING. */
    public void expireReset(Long deviceId,String uuid) {
        inventory.lock(deviceId).filter(i->Objects.equals(i.getOperationUuid(),uuid)).ifPresent(this::abortReset);
    }
    private void abortReset(DeviceInventory i) {
        if(!i.getState().equals("RESETTING"))return;
        // Heartbeat kế tiếp tính lại ACTIVE/CLAIMED qua wireConfig từ localReady và PIN.
        i.setState("CLAIMED");i.setSetupReady(false);
        events.publishEvent(new RealtimeConfig.DeviceUpdated());
    }
    private void failCommand(String uuid,String message) {
        commandRows.findForUpdate(uuid).ifPresent(c->{
            if(c.getStatus()!=CommandStatus.PENDING && c.getStatus()!=CommandStatus.SENT && c.getStatus()!=CommandStatus.TIMEOUT)return;
            c.setStatus(CommandStatus.FAILED);c.setAcknowledgedAt(LocalDateTime.now());c.setResultMessage(message);
        });
    }
    /**
     * Xóa audit log gắn với cửa mà không nạp cả bảng: chỉ quét bản ghi tạo sau khi cửa tồn tại, theo trang
     * và dạng projection (không đưa entity vào persistence context). Không dùng hàm JSON của MySQL để vẫn chạy trên H2.
     */
    private void deleteLinkedAudits(AccessUnit u,Set<Long> requestIds,Set<Long> credentialIds) {
        String unitId=u.getUnitId().toString();
        LocalDateTime since=u.getCreatedAt()==null?LocalDateTime.of(1970,1,1,0,0):u.getCreatedAt().minusMinutes(1);
        List<Long> doomed=new ArrayList<>();long cursor=0;
        while(true) {
            List<Object[]> page=em.createQuery("select a.auditLogId,a.entityType,a.entityId,a.details from AuditLog a "
                    +"where a.createdAt>=:since and a.auditLogId>:cursor order by a.auditLogId",Object[].class)
                .setParameter("since",since).setParameter("cursor",cursor).setMaxResults(AUDIT_PAGE).getResultList();
            for(Object[] row:page) {
                Long id=(Long)row[0];String type=(String)row[1];Long entityId=(Long)row[2];
                Object linked=row[3] instanceof Map<?,?> details?details.get("unitId"):null;
                boolean linkedUnit=linked!=null && unitId.equals(linked.toString());
                boolean linkedRequest="FACE_REQUEST".equals(type) && requestIds.contains(entityId);
                boolean linkedCredential="CREDENTIAL".equals(type) && credentialIds.contains(entityId);
                if(linkedUnit||linkedRequest||linkedCredential)doomed.add(id);
                cursor=id;
            }
            if(page.size()<AUDIT_PAGE)break;
        }
        for(int from=0;from<doomed.size();from+=AUDIT_PAGE)
            em.createQuery("delete from AuditLog a where a.auditLogId in :ids")
                .setParameter("ids",doomed.subList(from,Math.min(from+AUDIT_PAGE,doomed.size()))).executeUpdate();
    }
    public Issued issueAfterReset(String uid,String password) {
        Device d=devices.findByDeviceUidForUpdate(uid).orElseThrow();Account actor=current.requireAccount();
        reauthenticate(actor,password);
        DeviceInventory i=inventory.lock(d.getDeviceId()).orElseThrow();
        if(!i.getState().equals("INVENTORY") || i.getOperationUuid()==null || d.getAccessUnit()!=null)throw error(CONFLICT,"Reset chưa hoàn tất");
        // Only admin or the account recorded on the reset receipt may release the new code.
        if(!actor.isAdmin() && !Objects.equals(i.getRecipientId(),actor.getAccountId()) && !Objects.equals(i.getOperationActorId(),actor.getAccountId()))throw error(FORBIDDEN,"Chỉ người thực hiện reset, người nhận hoặc admin được cấp mã mới");
        String code=token();i.setClaimHash(digest(code));
        return new Issued(view(i),code,null,null,null,syncActivation(d,actor,code));
    }
    public com.smartaccess.dto.manager.CommandResponse syncActivationCode(String uid,String password,String code) {
        Device d=devices.findByDeviceUidForUpdate(uid).orElseThrow();Account actor=current.requireAccount();reauthenticate(actor,password);
        DeviceInventory i=inventory.lock(d.getDeviceId()).orElseThrow();
        if(!"INVENTORY".equals(i.getState()) || i.getOperationUuid()==null || d.getAccessUnit()!=null)throw error(CONFLICT,"Cửa cần ở trạng thái chờ nhận sau reset");
        if(!actor.isAdmin() && !Objects.equals(i.getRecipientId(),actor.getAccountId()) && !Objects.equals(i.getOperationActorId(),actor.getAccountId()))throw error(FORBIDDEN,"Không có quyền cấp mã cho cửa này");
        if(code==null || !code.matches("[A-Za-z0-9_-]{24,128}") || !Objects.equals(i.getClaimHash(),digest(code)))throw error(CONFLICT,"Mã nhận cửa đã cũ. Dùng mã mới nhất vừa cấp");
        return syncActivation(d,actor,code);
    }
    private com.smartaccess.dto.manager.CommandResponse syncActivation(Device d,Account actor,String code) {
        // The activation code goes only on the authenticated wire, never into command payload/audit.
        return com.smartaccess.dto.manager.CommandResponse.from(commands.dispatch(d,actor.getAccountId(),SYNC_ACTIVATION,
                Map.of("deviceId",d.getDeviceId()),Map.of("activationCode",code)));
    }
    public InventoryView view(DeviceInventory i) {
        Device d=i.getDevice();AccessUnit u=d.getAccessUnit();
        return new InventoryView(d.getDeviceId(),d.getDeviceUid(),i.getFactoryMac(),d.getDeviceName(),u==null?null:u.getUnitId(),
            u==null||u.getManager()==null?null:u.getManager().getFullName(),i.getState(),i.getGeneration(),i.isSetupReady(),
            i.getDoorClosed(),i.getLatchReleased(),d.getLastSeenAt(),i.getOperationUuid());
    }
}
