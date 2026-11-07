package com.smartaccess;

import com.smartaccess.model.*;
import com.smartaccess.model.enumtype.*;
import com.smartaccess.repository.*;
import com.smartaccess.service.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.LocalDateTime;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.NONE,properties={
 "spring.datasource.url=jdbc:h2:mem:member-removal;MODE=MySQL;DB_CLOSE_DELAY=-1",
 "spring.datasource.username=sa","spring.datasource.password=","spring.datasource.driver-class-name=org.h2.Driver",
 "spring.flyway.enabled=false","spring.jpa.hibernate.ddl-auto=create-drop","app.mqtt.enabled=false"})
class MemberRemovalFlowTest {
 @TestConfiguration static class Config {
  @Bean @Primary DeviceGateway gateway(){return (uid,uuid,type,data)->{};}
 }
 @Autowired AccountRepository accounts; @Autowired AccessUnitRepository units; @Autowired DeviceRepository devices;
 @Autowired DeviceInventoryRepository inventory; @Autowired UserAccessRepository members;
 @Autowired CredentialRepository credentials; @Autowired AccessLogRepository logs; @Autowired FaceRequestRepository requests;
 @Autowired ManagerService manager; @Autowired MemberRemovalService removals; @Autowired FingerprintService fingerprints;
 @Autowired RfidService rfids; @Autowired LocalAccessPolicyService policies; @Autowired TransactionTemplate tx;
 @Autowired CommandRepository commandRows; @Autowired CommandAckService acks;
 Account owner,target,other; AccessUnit unit,second; Device device,secondDevice; Credential finger,card,otherFinger,otherDoor,face;
 Long logId; static int sequence;
 Account account(String name){Account a=new Account();a.setFullName(name);a.setEmail(name+"@removal.test");a.setPasswordHash("test");return accounts.saveAndFlush(a);}
 AccessUnit unit(String name){AccessUnit u=new AccessUnit();u.setUnitName(name);u.setManager(owner);u.setPinEnabled(true);return units.saveAndFlush(u);}
 Device device(AccessUnit u,String uid){Device d=new Device();d.setDeviceUid(uid);d.setDeviceName(uid);d.setDeviceType(DeviceType.DOOR_CONTROLLER);d.setAccessUnit(u);d.setLifecycleStatus(DeviceLifecycleStatus.ACTIVE);d.setLastSeenAt(LocalDateTime.now());return devices.saveAndFlush(d);}
 void membership(Account a,AccessUnit u){UserAccess m=new UserAccess();m.setAccount(a);m.setAccessUnit(u);m.setAllowFace(true);m.setAllowFingerprint(true);m.setAllowRfid(true);m.setAllowRemoteUnlock(true);members.saveAndFlush(m);}
 Credential credential(Account a,Device d,CredentialType type,int slot,String uid){Credential c=new Credential();c.setAccount(a);c.setDevice(d);c.setCredentialType(type);if(slot>0)c.setLocalTemplateId((short)slot);c.setRfidUid(uid);return credentials.saveAndFlush(c);}
 @BeforeEach void seed(){tx.executeWithoutResult(status->{int n=++sequence;owner=account("owner"+n);target=account("target"+n);other=account("other"+n);
  unit=unit("Door one");second=unit("Door two");device=device(unit,"ESP32-REMOVAL-"+n);secondDevice=device(second,"ESP32-SECOND-"+n);
  DeviceInventory i=new DeviceInventory();i.setDevice(device);i.setFactoryMac(String.format("%012X",n));i.setState("ACTIVE");i.setSetupReady(true);inventory.saveAndFlush(i);
  membership(target,unit);membership(other,unit);membership(target,second);
  finger=credential(target,device,CredentialType.FINGERPRINT,5,null);card=credential(target,device,CredentialType.RFID,0,"A1B2C3D4");
  otherFinger=credential(other,device,CredentialType.FINGERPRINT,6,null);otherDoor=credential(target,secondDevice,CredentialType.FINGERPRINT,7,null);
  face=credential(target,null,CredentialType.FACE,0,null);
  FaceRequest request=new FaceRequest();request.setAccount(target);request.setAccessUnit(unit);request.setRequestType(FaceRequestType.ENROLL);requests.saveAndFlush(request);
  AccessLog log=new AccessLog();log.setAccessUuid(UUID.randomUUID().toString());log.setAccessUnit(unit);log.setSourceDevice(device);log.setAccount(target);log.setCredential(finger);log.setMethod(AccessMethod.FINGERPRINT);log.setResult(AccessResult.GRANTED);log.setOccurredAt(LocalDateTime.now());logId=logs.saveAndFlush(log).getAccessLogId();
 });}
 @Test void ownerCanRegisterTheirOwnCardAndFingerprint(){
  var self=manager.ownerAccess(owner.getAccountId(),unit.getUnitId());assertThat(self.userId()).isEqualTo(owner.getAccountId());
  assertThat(self.allowFingerprint()).isTrue();assertThat(self.allowRfid()).isTrue();
  var assigned=rfids.assign(owner.getAccountId(),unit.getUnitId(),owner.getAccountId(),"11223344");assertThat(assigned.rfidUid()).isEqualTo("11223344");
  var command=fingerprints.startEnroll(owner.getAccountId(),unit.getUnitId(),owner.getAccountId(),new com.smartaccess.dto.manager.AddFingerprintRequest("Owner finger"));assertThat(command.commandUuid()).isNotBlank();
  assertThat(manager.getUsers(owner.getAccountId(),unit.getUnitId())).noneMatch(u->u.userId().equals(owner.getAccountId()));
 }
 @Test void offlineRemovalRevokesImmediatelyAndRemainsQueuedUntilVerified(){
  tx.executeWithoutResult(s->{var d=devices.findById(device.getDeviceId()).orElseThrow();d.setLastSeenAt(LocalDateTime.now().minusHours(1));});
  var command=manager.removeUser(owner.getAccountId(),unit.getUnitId(),target.getAccountId());
  assertThat(members.existsById(new UserAccessId(target.getAccountId(),unit.getUnitId()))).isTrue();
  assertThat(credentials.findById(finger.getCredentialId()).orElseThrow().getStatus()).isEqualTo(CredentialStatus.REVOKED);
  assertThat(policies.snapshot(device.getDeviceUid()).get("fingerprints")).isEqualTo(List.of(6));
  assertThat(removals.configuration(device.getDeviceUid(),1)).hasSize(1);assertThat(removals.configuration(device.getDeviceUid(),2)).isEmpty();
  assertThat(manager.getUsers(owner.getAccountId(),unit.getUnitId()).stream().filter(u->u.userId().equals(target.getAccountId())).findFirst().orElseThrow().removalPending()).isTrue();
  assertThat(manager.removeUser(owner.getAccountId(),unit.getUnitId(),target.getAccountId()).commandUuid()).isEqualTo(command.commandUuid());
 }
 @Test void failedOrUnverifiedAckDoesNotRemoveMembershipOrSensorRecords(){
  var command=manager.removeUser(owner.getAccountId(),unit.getUnitId(),target.getAccountId());
  assertThat(removals.acknowledge(secondDevice.getDeviceUid(),command.commandUuid(),true,MemberRemovalService.VERIFIED)).isFalse();
  removals.acknowledge(device.getDeviceUid(),command.commandUuid(),false,"FINGERPRINT_ERASE_NOT_VERIFIED");
  removals.acknowledge(device.getDeviceUid(),command.commandUuid(),true,"OK");
  assertThat(members.existsById(new UserAccessId(target.getAccountId(),unit.getUnitId()))).isTrue();
  assertThat(credentials.existsById(finger.getCredentialId())).isTrue();assertThat(removals.configuration(device.getDeviceUid(),1)).hasSize(1);
 }
 @Test void verifiedAckDeletesOnlyThisDoorsCredentialsAndPreservesHistoryAndOtherDoors(){
  var command=manager.removeUser(owner.getAccountId(),unit.getUnitId(),target.getAccountId());
  assertThat(removals.acknowledge(device.getDeviceUid(),command.commandUuid(),true,MemberRemovalService.VERIFIED)).isTrue();
  assertThat(credentials.existsById(finger.getCredentialId())).isFalse();assertThat(credentials.existsById(card.getCredentialId())).isFalse();
  assertThat(credentials.existsById(otherFinger.getCredentialId())).isTrue();assertThat(credentials.existsById(otherDoor.getCredentialId())).isTrue();assertThat(credentials.existsById(face.getCredentialId())).isTrue();
  assertThat(members.existsById(new UserAccessId(target.getAccountId(),unit.getUnitId()))).isFalse();
  assertThat(members.existsById(new UserAccessId(target.getAccountId(),second.getUnitId()))).isTrue();assertThat(accounts.existsById(target.getAccountId())).isTrue();
  assertThat(requests.existsByAccount_AccountIdAndAccessUnit_UnitId(target.getAccountId(),unit.getUnitId())).isFalse();
  assertThat(logs.findById(logId).orElseThrow().getCredential()).isNull();assertThat(logs.findById(logId).orElseThrow().getResult()).isEqualTo(AccessResult.GRANTED);
  assertThat(removals.configuration(device.getDeviceUid(),1)).isEmpty();assertThat(removals.acknowledge(device.getDeviceUid(),command.commandUuid(),true,MemberRemovalService.VERIFIED)).isTrue();
 }
 @Test void enrollmentAndPermissionRestoreAreBlockedWhileRemovalIsPending(){
  manager.ownerAccess(owner.getAccountId(),unit.getUnitId());manager.removeUser(owner.getAccountId(),unit.getUnitId(),target.getAccountId());
  assertThatThrownBy(()->fingerprints.startEnroll(owner.getAccountId(),unit.getUnitId(),owner.getAccountId(),new com.smartaccess.dto.manager.AddFingerprintRequest("new"))).isInstanceOf(RuntimeException.class);
  assertThatThrownBy(()->rfids.assign(owner.getAccountId(),unit.getUnitId(),other.getAccountId(),"55667788")).isInstanceOf(RuntimeException.class);
  assertThatThrownBy(()->manager.updatePermissions(owner.getAccountId(),unit.getUnitId(),target.getAccountId(),new com.smartaccess.dto.manager.PermissionRequest(null,true,null,null))).isInstanceOf(RuntimeException.class);
 }
 @Test void oldRevokedSlotReusedByAnotherAccountIsExcludedFromHardwareErase(){
  Credential old=credential(target,device,CredentialType.FINGERPRINT,6,null);old.setStatus(CredentialStatus.REVOKED);credentials.saveAndFlush(old);
  manager.removeUser(owner.getAccountId(),unit.getUnitId(),target.getAccountId());
  assertThat(removals.configuration(device.getDeviceUid(),1).get(0).get("fingerprints")).isEqualTo(List.of(5));
 }
 @Test void timedOutEnrollmentCannotRecreateCredentialsAfterRemovalStarts(){
  tx.executeWithoutResult(s->{logs.detachCredentials(List.of(finger.getCredentialId()));credentials.deleteById(finger.getCredentialId());});
  Command old=new Command();old.setCommandUuid(UUID.randomUUID().toString());old.setCommandType(FingerprintService.FP_ENROLL);
  old.setDevice(device);old.setRequestedBy(owner);old.setStatus(CommandStatus.TIMEOUT);
  old.setPayload(Map.of("accountId",target.getAccountId(),"templateId",9,"label","late enrollment"));commandRows.saveAndFlush(old);
  manager.removeUser(owner.getAccountId(),unit.getUnitId(),target.getAccountId());
  assertThat(removals.configuration(device.getDeviceUid(),1).get(0).get("purgeFingerprints")).isEqualTo(true);
  assertThat(commandRows.findByCommandUuid(old.getCommandUuid()).orElseThrow().getStatus()).isEqualTo(CommandStatus.FAILED);
  acks.handleAck(device.getDeviceUid(),old.getCommandUuid(),true,"ENROLLED",(int)9);
  assertThat(credentials.findByDevice_DeviceIdAndCredentialTypeAndStatus(device.getDeviceId(),CredentialType.FINGERPRINT,CredentialStatus.ACTIVE))
          .allMatch(c->c.getAccount().getAccountId().equals(other.getAccountId()));
 }
}
