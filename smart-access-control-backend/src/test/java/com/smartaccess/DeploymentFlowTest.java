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
 record Sent(String uid,String uuid,String type,Map<String,Object> data){}
 static class RecordingGateway implements DeviceGateway {
  final List<Sent> sent=new ArrayList<>();
  public void send(String uid,String uuid,String type,Map<String,Object> data){sent.add(new Sent(uid,uuid,type,data));}
 }
 @TestConfiguration static class Config {
  @Bean @Primary RecordingGateway recordingGateway(){return new RecordingGateway();}
 }
 @Autowired RecordingGateway gateway;
 @Autowired DeploymentService deployment;@Autowired AccountRepository accounts;@Autowired DeviceRepository devices;
 @Autowired AccessUnitRepository units;@Autowired UserAccessRepository members;@Autowired DeviceInventoryRepository inventory;
 @Autowired PasswordEncoder passwords;@Autowired TransactionTemplate tx;@Autowired ObjectMapper json;
 @Autowired CredentialRepository credentials;
 @Autowired CommandRepository commandRows;@Autowired AuditLogRepository audits;
 @Autowired FaceEnrollmentService faces;
 @Autowired InvitationService invitations;
 @Autowired OnboardingService onboarding;@Autowired CommandAckService acknowledgements;
 Long admin,owner,stranger;static int seq;
 @BeforeEach void seed(){int n=++seq;admin=create("admin"+n,true);owner=create("owner"+n,false);stranger=create("other"+n,false);login(admin);}
 @AfterEach void clear(){SecurityContextHolder.clearContext();}
 Long create(String name,boolean admin){Account a=new Account();a.setFullName(name);a.setEmail(name+"@deploy.test");a.setAdmin(admin);a.setPasswordHash(passwords.encode("StrongPass!123"));return accounts.saveAndFlush(a).getAccountId();}
 void login(Long id){SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(new AccountPrincipal(id),null,List.of()));}
 DeploymentService.Issued registered(){return deployment.register(String.format("%012X",seq),"Physical door");}
 void onlineInventory(DeploymentService.Issued issued){tx.executeWithoutResult(s->{Device d=devices.findById(issued.device().deviceId()).orElseThrow();d.setLifecycleStatus(DeviceLifecycleStatus.ACTIVE);d.setLastSeenAt(LocalDateTime.now());});}
 DeploymentService.InventoryView claimed(DeploymentService.Issued issued){onlineInventory(issued);login(owner);return deployment.claim(issued.activationCode(),"My door");}
 void online(DeploymentService.InventoryView view){tx.executeWithoutResult(s->{Device d=devices.findById(view.deviceId()).orElseThrow();d.setLifecycleStatus(DeviceLifecycleStatus.ACTIVE);d.setLastSeenAt(LocalDateTime.now());d.getAccessUnit().setPinEnabled(true);d.setLocalAdminPinEnabled(true);d.setLocalAdminPinHash(passwords.encode("654321"));});}
 @Test void deviceUidCannotClaimAndActivationCodeIsOneTime(){
  var issued=registered();login(owner);
  assertThatThrownBy(()->deployment.claim(issued.device().deviceUid(),"Forged")).isInstanceOf(RuntimeException.class);
  onlineInventory(issued);var mine=deployment.claim(issued.activationCode(),"My door");assertThat(mine.state()).isEqualTo("CLAIMED");
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
  assertThatThrownBy(()->deployment.startReset(mine.deviceUid(),"StrongPass!123","654321",mine.deviceUid(),null)).isInstanceOf(RuntimeException.class);
  login(owner);assertThatThrownBy(()->deployment.startReset(mine.deviceUid(),"wrong","654321",mine.deviceUid(),null)).isInstanceOf(RuntimeException.class);
  assertThatThrownBy(()->deployment.startReset(mine.deviceUid(),"StrongPass!123","654321",mine.deviceUid(),null)).isInstanceOf(RuntimeException.class);
 }
 @Test void resetWaitsForVerifiedSensorAckThenDeletesDoorDataAndRejectsOldGeneration(){
  var mine=claimed(registered());online(mine);
  var pending=deployment.startReset(mine.deviceUid(),"StrongPass!123","654321",mine.deviceUid(),null);
  assertThat(pending.state()).isEqualTo("RESETTING");
  assertThatThrownBy(()->deployment.issueAfterReset(mine.deviceUid(),"StrongPass!123")).isInstanceOf(RuntimeException.class);
  assertThat(deployment.resetAck(mine.deviceUid(),json.createObjectNode().put("commandUuid",pending.operationUuid()).put("success",false))).isFalse();
  // Thiếu bằng chứng xóa: không throw (firmware sẽ gửi lại mãi), cửa trở lại CLAIMED và lệnh FAILED.
  assertThat(deployment.resetAck(mine.deviceUid(),json.createObjectNode().put("commandUuid",pending.operationUuid()).put("success",true).put("message","not-verified"))).isTrue();
  assertThat(deployment.status(mine.deviceUid()).state()).isEqualTo("CLAIMED");
  assertThat(commandRows.findByCommandUuid(pending.operationUuid()).orElseThrow().getStatus()).isEqualTo(CommandStatus.FAILED);
  // Ack xác minh đến muộn (thiết bị thật sự đã xóa) vẫn hoàn tất việc dọn dữ liệu.
  assertThat(deployment.resetAck(mine.deviceUid(),json.createObjectNode().put("commandUuid",pending.operationUuid()).put("success",true).put("message","RESET_EMPTY_VERIFIED"))).isTrue();
  var after=deployment.status(mine.deviceUid());assertThat(after.state()).isEqualTo("INVENTORY");assertThat(after.generation()).isEqualTo(2);assertThat(after.unitId()).isNull();
  assertThat(units.findById(mine.unitId())).isEmpty();assertThat(accounts.findById(owner)).isPresent();
  var code=deployment.issueAfterReset(mine.deviceUid(),"StrongPass!123");assertThat(code.activationCode()).isNotBlank();
  assertThat(code.syncCommand()).isNotNull();
  var qrCommand=commandRows.findByCommandUuid(code.syncCommand().commandUuid()).orElseThrow();
  assertThat(qrCommand.getCommandType()).isEqualTo(DeploymentService.SYNC_ACTIVATION);
  assertThat(qrCommand.getPayload()).doesNotContainKeys("activationCode","password");
  var qrSent=gateway.sent.get(gateway.sent.size()-1);
  assertThat(qrSent.data()).containsEntry("activationCode",code.activationCode()).containsEntry("activationSequence",qrCommand.getCommandId());
  var retried=deployment.syncActivationCode(mine.deviceUid(),"StrongPass!123",code.activationCode());
  assertThat(retried.commandUuid()).isNotEqualTo(code.syncCommand().commandUuid());
  assertThatThrownBy(()->deployment.syncActivationCode(mine.deviceUid(),"wrong",code.activationCode())).isInstanceOf(RuntimeException.class);
  assertThatThrownBy(()->deployment.syncActivationCode(mine.deviceUid(),"StrongPass!123",issuedOldCode())).isInstanceOf(RuntimeException.class);
  Device d=devices.findById(mine.deviceId()).orElseThrow();assertThat(deployment.acceptGeneration(d,json.createObjectNode().put("generation",1))).isFalse();
  assertThat(d.isLocalAdminPinEnabled()).isFalse();assertThat(d.getLocalAdminPinHash()).isNull();
  assertThat(deployment.resetAck(mine.deviceUid(),json.createObjectNode().put("commandUuid",pending.operationUuid()).put("success",true).put("message","RESET_EMPTY_VERIFIED"))).isTrue();
  assertThat(deployment.status(mine.deviceUid()).generation()).isEqualTo(2);
 }
 private String issuedOldCode(){return "obsolete_activation_01234567890123456789";}
 @Test void resetRequiresBothCredentialsAndNeverPersistsThem(){
  var mine=claimed(registered());online(mine);
  for(String pin:new String[]{"123456","000000","65432","6543210","", "abcdef"})
   assertThatThrownBy(()->deployment.startReset(mine.deviceUid(),"StrongPass!123",pin,mine.deviceUid(),null)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
  assertThatThrownBy(()->deployment.startReset(mine.deviceUid(),"StrongPass!123",null,mine.deviceUid(),null)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
  assertThatThrownBy(()->deployment.startReset(mine.deviceUid(),"wrong","654321",mine.deviceUid(),null)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
  assertThat(deployment.status(mine.deviceUid()).state()).isEqualTo("CLAIMED");
  assertThat(commandRows.findAll().stream().filter(c->c.getDevice().getDeviceId().equals(mine.deviceId()))).isEmpty();
  var pending=deployment.startReset(mine.deviceUid(),"StrongPass!123","654321",mine.deviceUid(),null);
  assertThat(commandRows.findByCommandUuid(pending.operationUuid()).orElseThrow().getPayload()).containsOnlyKeys("unitId");
 }
 @Test void resetRefusesUnconfirmedAdminPinAndAdminAlsoNeedsDoorPin(){
  var mine=claimed(registered());online(mine);login(admin);
  assertThatThrownBy(()->deployment.startReset(mine.deviceUid(),"StrongPass!123","123456",mine.deviceUid(),null)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
  tx.executeWithoutResult(s->devices.findById(mine.deviceId()).orElseThrow().setLocalAdminPinEnabled(false));
  assertThatThrownBy(()->deployment.startReset(mine.deviceUid(),"StrongPass!123","654321",mine.deviceUid(),null)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
  tx.executeWithoutResult(s->devices.findById(mine.deviceId()).orElseThrow().setLocalAdminPinEnabled(true));
  assertThat(deployment.startReset(mine.deviceUid(),"StrongPass!123","654321",mine.deviceUid(),null).state()).isEqualTo("RESETTING");
 }
 @Test void failedOrTimedOutResetReturnsDoorToServiceInsteadOfStayingResetting(){
  var mine=claimed(registered());online(mine);
  var first=deployment.startReset(mine.deviceUid(),"StrongPass!123","654321",mine.deviceUid(),null);
  assertThat(deployment.resetAck(mine.deviceUid(),json.createObjectNode().put("commandUuid",first.operationUuid()).put("success",false))).isFalse();
  assertThat(deployment.status(mine.deviceUid()).state()).isEqualTo("CLAIMED");
  // Không còn bị chặn "Cửa đang reset": chủ cửa thử reset lại được với lệnh mới.
  online(mine);
  var second=deployment.startReset(mine.deviceUid(),"StrongPass!123","654321",mine.deviceUid(),null);
  assertThat(second.state()).isEqualTo("RESETTING");assertThat(second.operationUuid()).isNotEqualTo(first.operationUuid());
  deployment.expireReset(mine.deviceId(),first.operationUuid()); // uuid cũ không ảnh hưởng thao tác mới
  assertThat(deployment.status(mine.deviceUid()).state()).isEqualTo("RESETTING");
  deployment.expireReset(mine.deviceId(),second.operationUuid());
  assertThat(deployment.status(mine.deviceUid()).state()).isEqualTo("CLAIMED");
 }
 @Test void failureAckFromOldGenerationIsAcceptedButSuccessIsNot(){
  var mine=claimed(registered());Device d=devices.findById(mine.deviceId()).orElseThrow();
  assertThat(deployment.acceptGeneration(d,json.createObjectNode().put("generation",99).put("commandUuid","x").put("success",false))).isTrue();
  assertThat(deployment.acceptGeneration(d,json.createObjectNode().put("generation",99).put("commandUuid","x").put("success",true))).isFalse();
  assertThat(deployment.acceptGeneration(d,json.createObjectNode().put("generation",99))).isFalse();
 }
 @Test void resetDeletesOnlyAuditLogsOfThatDoor(){
  var mine=claimed(registered());login(admin);
  var other=claimed(deployment.register(String.format("%012X",seq+20000),"Other chip"));
  Long mineAudit=audit(mine.unitId()),otherAudit=audit(other.unitId());
  online(mine);var pending=deployment.startReset(mine.deviceUid(),"StrongPass!123","654321",mine.deviceUid(),null);
  assertThat(deployment.resetAck(mine.deviceUid(),json.createObjectNode().put("commandUuid",pending.operationUuid()).put("success",true).put("message","RESET_EMPTY_VERIFIED"))).isTrue();
  assertThat(audits.findById(mineAudit)).isEmpty();assertThat(audits.findById(otherAudit)).isPresent();
 }
 @Test void cannotClaimBeforeOnlineAndInspectDoesNotConsumeCode(){
  var issued=registered();login(owner);
  assertThat(deployment.inspect(issued.activationCode()).online()).isFalse();
  assertThatThrownBy(()->deployment.claim(issued.activationCode(),"My door")).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
  assertThat(inventory.findById(issued.device().deviceId()).orElseThrow().getClaimHash()).isNotNull();
  onlineInventory(issued);assertThat(deployment.inspect(issued.activationCode()).online()).isTrue();
  assertThat(deployment.claim(issued.activationCode(),"My door").state()).isEqualTo("CLAIMED");
 }
 @Test void appPinsBecomeEffectiveOnlyAfterDeviceAcknowledgement(){
  var mine=claimed(registered());online(mine);
  tx.executeWithoutResult(s->units.findById(mine.unitId()).orElseThrow().setPinEnabled(false));
  var cmd=onboarding.credentials(owner,mine.unitId(),"123456","123456","654321","654321");
  assertThat(units.findById(mine.unitId()).orElseThrow().isPinEnabled()).isFalse();
  var row=commandRows.findByCommandUuid(cmd.commandUuid()).orElseThrow();
  assertThat(row.getPayload()).doesNotContainKeys("pin","adminPin");
  acknowledgements.handleAck(mine.deviceUid(),cmd.commandUuid(),true,"PINS_CONFIGURED");
  assertThat(units.findById(mine.unitId()).orElseThrow().isPinEnabled()).isTrue();
  Device d=devices.findById(mine.deviceId()).orElseThrow();assertThat(d.isLocalAdminPinEnabled()).isTrue();
  assertThat(passwords.matches("654321",d.getLocalAdminPinHash())).isTrue();
  assertThat(commandRows.findByCommandUuid(cmd.commandUuid()).orElseThrow().getPayload()).containsOnlyKeys("unitId");
 }
 @Test void servoConfirmationIsRequiredWhenDeviceReportsGuidedSetup(){
  var mine=claimed(registered());online(mine);
  deployment.wireConfig(mine.deviceUid(),json.createObjectNode().put("generation",1).put("localReady",true).put("hasDoorPin",true).put("servoCalibrated",false));
  assertThat(deployment.status(mine.deviceUid()).setupReady()).isFalse();
  deployment.wireConfig(mine.deviceUid(),json.createObjectNode().put("generation",1).put("localReady",true).put("hasDoorPin",true).put("servoCalibrated",true));
  assertThat(deployment.status(mine.deviceUid()).setupReady()).isTrue();
 }
 @Test void latchWithoutAnyCommandRemainsUnknownAfterHeartbeat(){
  var mine=claimed(registered());
  deployment.wireConfig(mine.deviceUid(),json.createObjectNode().put("generation",1).putNull("unlocked"));
  assertThat(deployment.status(mine.deviceUid()).latchReleased()).isNull();
 }
 Long audit(Long unitId){
  AuditLog a=new AuditLog();a.setAction("UPDATE_PERMISSION");a.setEntityType("USER_ACCESS");a.setEntityId(owner);
  a.setDetails(Map.of("unitId",unitId));return audits.saveAndFlush(a).getAuditLogId();
 }
}
