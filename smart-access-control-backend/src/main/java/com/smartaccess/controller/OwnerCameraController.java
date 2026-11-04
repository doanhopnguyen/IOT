package com.smartaccess.controller;

import com.smartaccess.model.*;
import com.smartaccess.model.enumtype.*;
import com.smartaccess.repository.*;
import com.smartaccess.service.*;
import com.smartaccess.dto.manager.DeviceResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.web.bind.annotation.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;
import static org.springframework.http.HttpStatus.*;

/** A camera belongs to a door and is provisioned by that door's owner. */
@RestController @RequestMapping("/api/manager/units/{unitId}/camera-node") @Transactional
public class OwnerCameraController {
 public record Password(@NotBlank String password){}
 public record Issued(String deviceUid,String deviceSecret){}
 private final CurrentAccountService current;private final ManagerAccessGuard guard;private final DeviceRepository devices;private final PasswordEncoder passwords;
 public OwnerCameraController(CurrentAccountService current,ManagerAccessGuard guard,DeviceRepository devices,PasswordEncoder passwords){this.current=current;this.guard=guard;this.devices=devices;this.passwords=passwords;}
 @GetMapping public List<DeviceResponse> list(@PathVariable Long unitId){owner(unitId);return devices.findAll().stream().filter(d->d.getAccessUnit()!=null&&d.getAccessUnit().getUnitId().equals(unitId)&&d.getDeviceType()==DeviceType.FACE_CAMERA_NODE).map(DeviceResponse::from).toList();}
 @PostMapping public Issued create(@PathVariable Long unitId,@Valid @RequestBody Password input){
  Account actor=owner(unitId);if(!passwords.matches(input.password(),actor.getPasswordHash()))throw new ResponseStatusException(FORBIDDEN,"Cần xác thực lại mật khẩu");
  if(!list(unitId).isEmpty())throw new ResponseStatusException(CONFLICT,"Gỡ camera cũ trước khi cấp camera mới");
  String uid="FACE-"+UUID.randomUUID();String secret=UUID.randomUUID().toString()+UUID.randomUUID();
  Device d=new Device();d.setDeviceUid(uid);d.setDeviceName("Camera cửa "+unitId);d.setDeviceType(DeviceType.FACE_CAMERA_NODE);d.setAccessUnit(guard.requireManagedUnit(actor.getAccountId(),unitId));
  d.setDeviceSecretHash(passwords.encode(secret));d.setBootstrapSecretHash(passwords.encode(UUID.randomUUID().toString()));d.setLifecycleStatus(DeviceLifecycleStatus.PROVISIONED);devices.saveAndFlush(d);return new Issued(uid,secret);
 }
 @DeleteMapping("/{uid}") public void remove(@PathVariable Long unitId,@PathVariable String uid,@Valid @RequestBody Password input){
  Account actor=owner(unitId);if(!passwords.matches(input.password(),actor.getPasswordHash()))throw new ResponseStatusException(FORBIDDEN);
  Device d=devices.findByDeviceUidForUpdate(uid).filter(x->x.getDeviceType()==DeviceType.FACE_CAMERA_NODE&&x.getAccessUnit()!=null&&x.getAccessUnit().getUnitId().equals(unitId)).orElseThrow(()->new ResponseStatusException(NOT_FOUND));
  d.setAccessUnit(null);d.setLifecycleStatus(DeviceLifecycleStatus.DECOMMISSIONED);d.setDeviceSecretHash(passwords.encode(UUID.randomUUID().toString()));
 }
 private Account owner(Long id){Account a=current.requireAccount();guard.requireManagedUnit(a.getAccountId(),id);return a;}
}
