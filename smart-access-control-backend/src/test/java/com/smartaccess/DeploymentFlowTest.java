package com.smartaccess;

import com.smartaccess.model.*;
import com.smartaccess.model.enumtype.*;
import com.smartaccess.repository.*;
import com.smartaccess.security.AccountPrincipal;
import com.smartaccess.service.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.*;
import org.springframework.context.annotation.*;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.LocalDateTime;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.NONE,properties={
 "spring.datasource.url=jdbc:h2:mem:deployment;MODE=MySQL;DB_CLOSE_DELAY=-1",
 "spring.datasource.username=sa","spring.datasource.password=","spring.datasource.driver-class-name=org.h2.Driver",
 "spring.flyway.enabled=false","spring.jpa.hibernate.ddl-auto=create-drop","app.mqtt.enabled=false"})
class DeploymentFlowTest {
 @TestConfiguration static class Config {
  @Bean @Primary DeviceGateway recordingGateway(){return (uid,uuid,type,data)->{};}
 }
 @Autowired DeploymentService deployment;@Autowired AccountRepository accounts;@Autowired DeviceRepository devices;
 @Autowired AccessUnitRepository units;@Autowired UserAccessRepository members;@Autowired DeviceInventoryRepository inventory;
 @Autowired PasswordEncoder passwords;@Autowired TransactionTemplate tx;@Autowired ObjectMapper json;
 @Autowired CredentialRepository credentials;
 @Autowired FaceEnrollmentService faces;
 @Autowired InvitationService invitations;
 Long admin,owner,stranger;static int seq;
 @BeforeEach void seed(){int n=++seq;admin=create("admin"+n,true);owner=create("owner"+n,false);stranger=create("other"+n,false);login(admin);}
 @AfterEach void clear(){SecurityContextHolder.clearContext();}
 Long create(String name,boolean admin){Account a=new Account();a.setFullName(name);a.setEmail(name+"@deploy.test");a.setAdmin(admin);a.setPasswordHash(passwords.encode("StrongPass!123"));return accounts.saveAndFlush(a).getAccountId();}
 void login(Long id){SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(new AccountPrincipal(id),null,List.of()));}
 DeploymentService.Issued registered(){return deployment.register(String.format("%012X",seq),"Physical door");}
 DeploymentService.InventoryView claimed(DeploymentService.Issued issued){login(owner);return deployment.claim(issued.activationCode(),"My door");}
 void online(DeploymentService.InventoryView view){tx.executeWithoutResult(s->{Device d=devices.findById(view.deviceId()).orElseThrow();d.setLifecycleStatus(DeviceLifecycleStatus.ACTIVE);d.setLastSeenAt(LocalDateTime.now());d.getAccessUnit().setPinEnabled(true);});}
 @Test void deviceUidCannotClaimAndActivationCodeIsOneTime(){
  var issued=registered();login(owner);
  assertThatThrownBy(()->deployment.claim(issued.device().deviceUid(),"Forged")).isInstanceOf(RuntimeException.class);
  var mine=deployment.claim(issued.activationCode(),"My door");assertThat(mine.state()).isEqualTo("CLAIMED");
  login(stranger);assertThatThrownBy(()->deployment.claim(issued.activationCode(),"Other door")).isInstanceOf(RuntimeException.class);
  assertThat(units.findByManager_AccountIdOrderByUnitId(stranger)).isEmpty();
 }
 @Test void duplicateFactoryMacCannotBecomeAnotherDevice(){registered();assertThatThrownBy(()->registered()).isInstanceOf(RuntimeException.class);}
 @Test void factoryPackageContainsProductSetupBeforeShipping(){
  var issued=registered();assertThat(issued.activationCode()).hasSize(32);assertThat(issued.setupPassword()).hasSize(12);
  assertThat(issued.setupSsid()).isEqualTo("SmartDoor-"+issued.device().factoryMac().substring(6));
 }
 @Test void pinConfiguredOnProductCanCompleteSetupWithoutSendingThePinToTheServer(){
  var mine=claimed(registered());
  deployment.wireConfig(mine.deviceUid(),json.createObjectNode().put("generation",1).put("localReady",true).put("hasDoorPin",true));
  assertThat(deployment.status(mine.deviceUid()).setupReady()).isTrue();
 }
 @Test void invitationNeedsRecipientConsentAndDoesNotGrantUnlockRights(){
  var door=claimed(registered());var invite=invitations.invite(door.unitId(),stranger);
  assertThat(invitations.invite(door.unitId(),stranger).id()).isEqualTo(invite.id());
  assertThat(members.existsById(new UserAccessId(stranger,door.unitId()))).isFalse();
  assertThatThrownBy(()->invitations.respond(invite.id(),true)).isInstanceOf(RuntimeException.class);
  login(stranger);invitations.respond(invite.id(),true);
  UserAccess member=members.findById(new UserAccessId(stranger,door.unitId())).orElseThrow();
  assertThat(member.isAllowFace()||member.isAllowFingerprint()||member.isAllowRfid()||member.isAllowRemoteUnlock()).isFalse();
  assertThatThrownBy(()->invitations.respond(invite.id(),true)).isInstanceOf(RuntimeException.class);
 }
 @Test void oneGlobalFaceProfileCanRequestTwoDoorsButApprovalIsSeparateAndChangingProfileRevokesOldRights(){
  var door1=claimed(registered());login(admin);
  var issued2=deployment.register(String.format("%012X",seq+10000),"Second chip");var door2=claimed(issued2);
  tx.executeWithoutResult(s->{for(Long id:List.of(door1.unitId(),door2.unitId())){UserAccess m=new UserAccess();m.setAccount(accounts.getReferenceById(stranger));m.setAccessUnit(units.getReferenceById(id));members.save(m);}});
  login(stranger);var vector=new ArrayList<Float>(Collections.nCopies(512,0f));vector.set(0,1f);
  var profile=faces.registerProfile(new com.smartaccess.dto.FaceDtos.ProfileInput(true,FaceEmbedding.MODEL,vector));
  var request1=faces.create(new com.smartaccess.dto.FaceDtos.CreateRequest(door1.unitId(),null,true,null,null));
  var request2=faces.create(new com.smartaccess.dto.FaceDtos.CreateRequest(door2.unitId(),null,true,null,null));
  login(owner);faces.decide(request1.id(),true);
  assertThat(faces.hasApproval(stranger,door1.unitId())).isTrue();assertThat(faces.hasApproval(stranger,door2.unitId())).isFalse();
  faces.decide(request2.id(),true);assertThat(faces.hasApproval(stranger,door2.unitId())).isTrue();
  login(stranger);assertThat(faces.profile().credentialId()).isEqualTo(profile.credentialId());
  faces.registerProfile(new com.smartaccess.dto.FaceDtos.ProfileInput(true,FaceEmbedding.MODEL,vector));
  assertThat(faces.hasApproval(stranger,door1.unitId())).isFalse();assertThat(faces.hasApproval(stranger,door2.unitId())).isFalse();
 }
 @Test void heartbeatDoesNotCompleteSetupUntilLocalAndPinReady(){
  var issued=registered();var mine=claimed(issued);
  deployment.wireConfig(mine.deviceUid(),json.createObjectNode().put("generation",1).put("localReady",true));
  assertThat(deployment.status(mine.deviceUid()).setupReady()).isFalse();
  online(mine);deployment.wireConfig(mine.deviceUid(),json.createObjectNode().put("generation",1).put("localReady",true));
  assertThat(deployment.status(mine.deviceUid()).setupReady()).isTrue();
  deployment.wireConfig(mine.deviceUid(),json.createObjectNode().put("generation",1).put("localReady",false).putNull("doorClosed"));
  assertThat(deployment.status(mine.deviceUid()).setupReady()).isFalse();
  assertThat(deployment.status(mine.deviceUid()).state()).isEqualTo("CLAIMED");
  assertThat(deployment.status(mine.deviceUid()).doorClosed()).isNull();
 }
 @Test void resetRequiresOwnerOrAdminPasswordConfirmationAndOnlineDevice(){
  var mine=claimed(registered());login(stranger);
  assertThatThrownBy(()->deployment.startReset(mine.deviceUid(),"StrongPass!123",mine.deviceUid(),null)).isInstanceOf(RuntimeException.class);
  login(owner);assertThatThrownBy(()->deployment.startReset(mine.deviceUid(),"wrong",mine.deviceUid(),null)).isInstanceOf(RuntimeException.class);
  assertThatThrownBy(()->deployment.startReset(mine.deviceUid(),"StrongPass!123",mine.deviceUid(),null)).isInstanceOf(RuntimeException.class);
 }
 @Test void resetWaitsForVerifiedSensorAckThenDeletesDoorDataAndRejectsOldGeneration(){
  var mine=claimed(registered());online(mine);
  var pending=deployment.startReset(mine.deviceUid(),"StrongPass!123",mine.deviceUid(),null);
  assertThat(pending.state()).isEqualTo("RESETTING");
  assertThatThrownBy(()->deployment.issueAfterReset(mine.deviceUid(),"StrongPass!123")).isInstanceOf(RuntimeException.class);
  assertThat(deployment.resetAck(mine.deviceUid(),json.createObjectNode().put("commandUuid",pending.operationUuid()).put("success",false))).isFalse();
  assertThatThrownBy(()->deployment.resetAck(mine.deviceUid(),json.createObjectNode().put("commandUuid",pending.operationUuid()).put("success",true).put("message","not-verified"))).isInstanceOf(RuntimeException.class);
  assertThat(deployment.resetAck(mine.deviceUid(),json.createObjectNode().put("commandUuid",pending.operationUuid()).put("success",true).put("message","RESET_EMPTY_VERIFIED"))).isTrue();
  var after=deployment.status(mine.deviceUid());assertThat(after.state()).isEqualTo("INVENTORY");assertThat(after.generation()).isEqualTo(2);assertThat(after.unitId()).isNull();
  assertThat(units.findById(mine.unitId())).isEmpty();assertThat(accounts.findById(owner)).isPresent();
  var code=deployment.issueAfterReset(mine.deviceUid(),"StrongPass!123");assertThat(code.activationCode()).isNotBlank();
  Device d=devices.findById(mine.deviceId()).orElseThrow();assertThat(deployment.acceptGeneration(d,json.createObjectNode().put("generation",1))).isFalse();
  assertThat(deployment.resetAck(mine.deviceUid(),json.createObjectNode().put("commandUuid",pending.operationUuid()).put("success",true).put("message","RESET_EMPTY_VERIFIED"))).isTrue();
  assertThat(deployment.status(mine.deviceUid()).generation()).isEqualTo(2);
 }
}
