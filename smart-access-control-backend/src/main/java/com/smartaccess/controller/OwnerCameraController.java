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

/** A camera belongs to a door; the owner pairs an admin-issued AI kit by its one-time pairing code. */
@RestController @RequestMapping("/api/manager/units/{unitId}/camera-node") @Transactional
public class OwnerCameraController {
 public record Password(@NotBlank String password){}
 public record Pair(@NotBlank String password,String pairingCode){}
 private final CurrentAccountService current;private final ManagerAccessGuard guard;private final DeviceRepository devices;private final PasswordEncoder passwords;
 private final EdgeAiPairingService pairing;
 public OwnerCameraController(CurrentAccountService current,ManagerAccessGuard guard,DeviceRepository devices,PasswordEncoder passwords,EdgeAiPairingService pairing){this.current=current;this.guard=guard;this.devices=devices;this.passwords=passwords;this.pairing=pairing;}
 @GetMapping public List<DeviceResponse> list(@PathVariable Long unitId){owner(unitId);return devices.findAll().stream().filter(d->d.getAccessUnit()!=null&&d.getAccessUnit().getUnitId().equals(unitId)&&d.getDeviceType()==DeviceType.FACE_CAMERA_NODE&&d.getLifecycleStatus()!=DeviceLifecycleStatus.DECOMMISSIONED).map(DeviceResponse::from).toList();}
 /** Ghép bộ camera AI do admin cấp. Endpoint tự cấp camera cũ (POST không có /pair) đã bị bỏ. */
 @PostMapping("/pair") public EdgeAiPairingService.Issued pair(@PathVariable Long unitId,@Valid @RequestBody Pair input){
  Account actor=owner(unitId);
  return pairing.pair(actor.getAccountId(),unitId,input.pairingCode(),input.password());
 }
 @DeleteMapping("/{uid}") public void remove(@PathVariable Long unitId,@PathVariable String uid,@Valid @RequestBody Password input){
  Account actor=owner(unitId);if(!passwords.matches(input.password(),actor.getPasswordHash()))throw new ResponseStatusException(FORBIDDEN);
  Device d=devices.findByDeviceUidForUpdate(uid).filter(x->x.getDeviceType()==DeviceType.FACE_CAMERA_NODE&&x.getAccessUnit()!=null&&x.getAccessUnit().getUnitId().equals(unitId)).orElseThrow(()->new ResponseStatusException(NOT_FOUND));
  d.setAccessUnit(null);d.setLifecycleStatus(DeviceLifecycleStatus.DECOMMISSIONED);d.setDeviceSecretHash(passwords.encode(UUID.randomUUID().toString()));
 }
 private Account owner(Long id){Account a=current.requireAccount();guard.requireManagedUnit(a.getAccountId(),id);return a;}
}
