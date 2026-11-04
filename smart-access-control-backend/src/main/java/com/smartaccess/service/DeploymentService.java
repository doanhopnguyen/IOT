package com.smartaccess.service;

import com.smartaccess.model.*;
import com.smartaccess.model.enumtype.*;
import com.smartaccess.repository.*;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.EntityManager;
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
    public record Issued(InventoryView device,String activationCode,String deviceSecret,String setupSsid,String setupPassword) {}
    private final DeviceInventoryRepository inventory;
    private final DeviceRepository devices;
    private final AccessUnitRepository units;
    private final AccountRepository accounts;
    private final CurrentAccountService current;
    private final PasswordEncoder passwords;
    private final ManagerAccessGuard guard;
    private final DeviceCommandService commands;
    private final EntityManager em;
    public DeploymentService(DeviceInventoryRepository inventory,DeviceRepository devices,AccessUnitRepository units,
        AccountRepository accounts,CurrentAccountService current,PasswordEncoder passwords,ManagerAccessGuard guard,
        DeviceCommandService commands,EntityManager em) {
        this.inventory=inventory;this.devices=devices;this.units=units;this.accounts=accounts;
        this.current=current;this.passwords=passwords;this.guard=guard;this.commands=commands;this.em=em;
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
    public InventoryView claim(String code,String name) {
        Account actor=current.requireAccount();
        if(code==null || code.length()<24 || code.length()>128 || name==null || name.isBlank() || name.length()>100) throw error(BAD_REQUEST,"Mã nhận cửa/tên không hợp lệ");
        DeviceInventory i=inventory.claimForUpdate(digest(code.trim())).orElseThrow(()->error(NOT_FOUND,"Mã không hợp lệ hoặc đã dùng"));
        Device d=i.getDevice();
        if(!i.getState().equals("INVENTORY") || d.getAccessUnit()!=null) throw error(CONFLICT,"Cửa đã được nhận");
        if(i.getRecipientId()!=null && !i.getRecipientId().equals(actor.getAccountId())) throw error(FORBIDDEN,"Mã dành cho tài khoản nhận bàn giao");
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
    public InventoryView startReset(String uid,String password,String confirmation,String recipientEmail) {
        Device d=devices.findByDeviceUidForUpdate(uid).orElseThrow(()->error(NOT_FOUND,"Device not found"));
        Account a=requireOwnerOrAdmin(d);reauthenticate(a,password);
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
        commands.dispatchWithUuid(d,a.getAccountId(),"DEVICE_RESET",Map.of("unitId",d.getAccessUnit().getUnitId()),
            Map.of("generation",i.getGeneration(),"nextGeneration",i.getGeneration()+1),uuid);
        return view(i);
    }
    public Map<String,Object> wireConfig(String uid,JsonNode state) {
        Device d=devices.findByDeviceUidForUpdate(uid).orElseThrow();
        DeviceInventory i=inventory.lock(d.getDeviceId()).orElse(null);
        if(i==null) return Map.of();
        if(state.path("generation").asLong(-1)!=i.getGeneration()) return Map.of("generation",i.getGeneration(),"generationMismatch",true);
        if(state.has("doorClosed"))i.setDoorClosed(state.hasNonNull("doorClosed")?state.path("doorClosed").asBoolean():null);
        if(state.has("unlocked"))i.setLatchReleased(state.path("unlocked").asBoolean());
        i.setStateUpdatedAt(LocalDateTime.now());
        boolean localReady=state.path("localReady").asBoolean(false);
        if(state.path("hasDoorPin").asBoolean(false) && d.getAccessUnit()!=null)d.getAccessUnit().setPinEnabled(true);
        if(i.getState().equals("CLAIMED") || i.getState().equals("ACTIVE")) {
            boolean ready=localReady && d.getAccessUnit()!=null && d.getAccessUnit().isPinEnabled();
            i.setSetupReady(ready);i.setState(ready?"ACTIVE":"CLAIMED");
        }
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
        return message.has("commandUuid") && Objects.equals(i.getOperationUuid(),message.path("commandUuid").asText())
            && Objects.equals(i.getOperationGeneration(),gen);
    }
    public boolean resetAck(String uid,JsonNode message) {
        Device d=devices.findByDeviceUidForUpdate(uid).orElseThrow();
        DeviceInventory i=inventory.lock(d.getDeviceId()).orElse(null);
        if(i==null || !Objects.equals(i.getOperationUuid(),message.path("commandUuid").asText()))return false;
        if(i.getState().equals("INVENTORY"))return true; // Idempotent late ACK after a committed cleanup.
        if(!i.getState().equals("RESETTING") || !message.path("success").asBoolean())return false;
        if(!"RESET_EMPTY_VERIFIED".equals(message.path("message").asText()))throw error(CONFLICT,"Reset chưa có bằng chứng xóa đầy đủ");
        AccessUnit u=d.getAccessUnit();Long unitId=u==null?null:u.getUnitId();
        if(unitId!=null) {
            var requestIds=em.createQuery("select r.requestId from FaceRequest r where r.accessUnit.unitId=:id",Long.class).setParameter("id",unitId).getResultList();
            var credentialIds=em.createQuery("select c.credentialId from Credential c where c.device.accessUnit.unitId=:id",Long.class).setParameter("id",unitId).getResultList();
            for(AuditLog audit:em.createQuery("select a from AuditLog a",AuditLog.class).getResultList()) {
                Object linked=audit.getDetails()==null?null:audit.getDetails().get("unitId");
                boolean linkedUnit=linked!=null && unitId.toString().equals(linked.toString());
                boolean linkedRequest="FACE_REQUEST".equals(audit.getEntityType()) && requestIds.contains(audit.getEntityId());
                boolean linkedCredential="CREDENTIAL".equals(audit.getEntityType()) && credentialIds.contains(audit.getEntityId());
                if(linkedUnit||linkedRequest||linkedCredential)em.remove(audit);
            }
            em.flush();
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
            for(Long deviceId:deviceIds) {Device item=devices.findById(deviceId).orElseThrow();item.setAccessUnit(null);item.setLifecycleStatus(DeviceLifecycleStatus.REGISTERED);item.setLastSeenAt(null);}
            em.flush();units.delete(u);em.flush();
        }
        i.setGeneration(i.getGeneration()+1);i.setSetupReady(false);i.setDoorClosed(null);i.setLatchReleased(null);i.setState("INVENTORY");i.setClaimHash(null);
        return true;
    }
    public Issued issueAfterReset(String uid,String password) {
        Device d=devices.findByDeviceUidForUpdate(uid).orElseThrow();Account actor=current.requireAccount();
        reauthenticate(actor,password);
        DeviceInventory i=inventory.lock(d.getDeviceId()).orElseThrow();
        if(!i.getState().equals("INVENTORY") || i.getOperationUuid()==null || d.getAccessUnit()!=null)throw error(CONFLICT,"Reset chưa hoàn tất");
        // Only admin or the account recorded on the reset receipt may release the new code.
        if(!actor.isAdmin() && !Objects.equals(i.getRecipientId(),actor.getAccountId()) && !Objects.equals(i.getOperationActorId(),actor.getAccountId()))throw error(FORBIDDEN,"Chỉ người thực hiện reset, người nhận hoặc admin được cấp mã mới");
        String code=token();i.setClaimHash(digest(code));return new Issued(view(i),code,null,null,null);
    }
    public InventoryView view(DeviceInventory i) {
        Device d=i.getDevice();AccessUnit u=d.getAccessUnit();
        return new InventoryView(d.getDeviceId(),d.getDeviceUid(),i.getFactoryMac(),d.getDeviceName(),u==null?null:u.getUnitId(),
            u==null||u.getManager()==null?null:u.getManager().getFullName(),i.getState(),i.getGeneration(),i.isSetupReady(),
            i.getDoorClosed(),i.getLatchReleased(),d.getLastSeenAt(),i.getOperationUuid());
    }
}
