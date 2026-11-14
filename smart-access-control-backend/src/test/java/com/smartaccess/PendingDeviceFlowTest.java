package com.smartaccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartaccess.exception.BusinessException;
import com.smartaccess.model.*;
import com.smartaccess.model.enumtype.*;
import com.smartaccess.repository.*;
import com.smartaccess.security.AccountPrincipal;
import com.smartaccess.service.*;
import com.smartaccess.service.DeviceProvisioningService.Stage;
import org.junit.jupiter.api.*;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
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
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.NONE,properties={
 "spring.datasource.url=jdbc:h2:mem:pending;MODE=MySQL;DB_CLOSE_DELAY=-1",
 "spring.datasource.username=sa","spring.datasource.password=","spring.datasource.driver-class-name=org.h2.Driver",
 "spring.flyway.enabled=false","spring.jpa.hibernate.ddl-auto=create-drop","app.mqtt.enabled=false",
 "app.provisioning.mqtt-host=192.168.1.10","app.provisioning.mqtt-port=1884"})
class PendingDeviceFlowTest {
 static final String PASSWORD="StrongPass!123";
 /** Chạy ngay, hoặc giữ lại khi hold=true để mô phỏng job đang chạy. */
 static class TestExecutor implements ProvisioningExecutor {
  boolean hold;final List<Runnable> held=new ArrayList<>();
  public void execute(Runnable task){if(hold)held.add(task);else task.run();}
 }
 @TestConfiguration static class Config {
  @Bean @Primary BrokerAccounts brokerAccounts(){return mock(BrokerAccounts.class);}
  @Bean @Primary UsbDeviceService usbDeviceService(){return mock(UsbDeviceService.class);}
  @Bean @Primary TestExecutor testExecutor(){return new TestExecutor();}
 }
 @Autowired DeviceRepository devices;@Autowired DeviceInventoryRepository inventory;@Autowired TransactionTemplate tx;
 @Autowired DeploymentService deployment;@Autowired DeviceProvisioningService provisioning;
 @Autowired AccountRepository accounts;@Autowired FirmwareReleaseRepository releases;@Autowired PasswordEncoder passwords;
 @Autowired BrokerAccounts brokers;@Autowired UsbDeviceService usb;@Autowired TestExecutor executor;
 @Autowired DeviceAuthenticationService authentication;@Autowired ObjectMapper json;
 static int seq;Long admin,owner,otherAdmin,release,bareRelease;String mac,colonMac;

 @BeforeEach void seed(){
  int n=++seq;admin=create("padmin"+n,true);otherAdmin=create("padmin2-"+n,true);owner=create("powner"+n,false);
  mac=String.format("A0B1C2%06X",n);colonMac=String.join(":",mac.split("(?<=\\G..)"));
  release=release("9.0."+n,true);bareRelease=release("9.1."+n,false);
  reset(brokers,usb);executor.hold=false;executor.held.clear();
  when(usb.enabled()).thenReturn(true);
  when(usb.read("COM5")).thenReturn(new UsbDeviceService.Mac("COM5",colonMac,"ESP32-S3"));
  when(usb.provision(eq("COM5"),anyString())).thenAnswer(i->new UsbDeviceService.Provisioned(mac,"ESP32-"+mac,"9.0.0"));
  login(admin);
 }
 @AfterEach void clear(){SecurityContextHolder.clearContext();}
 Long create(String name,boolean isAdmin){Account a=new Account();a.setFullName(name);a.setEmail(name+"@pending.test");a.setAdmin(isAdmin);
  a.setPasswordHash(passwords.encode(PASSWORD));return accounts.saveAndFlush(a).getAccountId();}
 void login(Long id){SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(new AccountPrincipal(id),null,List.of()));}
 Long release(String version,boolean factory){
  FirmwareRelease r=new FirmwareRelease();r.setVersion(version);r.setLabel("t");r.setHardwareVersion("esp32s3-n16r8");r.setNotes("");
  r.setImage(new byte[]{(byte)0xE9});r.setImageSize(1);r.setSha256("0".repeat(64));r.setPublishedAt(LocalDateTime.now());
  r.setPublishedBy(accounts.getReferenceById(admin));
  if(factory){r.setFactoryImage(new byte[]{(byte)0xE9,1,2});r.setFactorySize(3);r.setFactorySha256("1".repeat(64));}
  return releases.saveAndFlush(r).getReleaseId();
 }
 DeploymentService.InventoryView pending(){return deployment.createPending("Cửa kho");}
 DeviceProvisioningService.JobView flash(Long deviceId){return provisioning.start(deviceId,"COM5",release,PASSWORD);}
 DeviceInventory stored(Long id){return inventory.findById(id).orElseThrow();}
 String sentBundle(int call){var captor=ArgumentCaptor.forClass(String.class);verify(usb,atLeast(call)).provision(eq("COM5"),captor.capture());return captor.getAllValues().get(call-1);}

 @Test void pendingInventoryAllowsMissingMacAndManyPendingRows(){
  long before=inventory.count();
  tx.executeWithoutResult(status->{for(String uid:new String[]{"PENDING-00000000"+String.format("%04X",seq),"PENDING-01000000"+String.format("%04X",seq)}){
   Device d=new Device();d.setDeviceUid(uid);d.setDeviceName("Chờ nạp");d.setDeviceType(DeviceType.DOOR_CONTROLLER);
   devices.saveAndFlush(d);
   DeviceInventory i=new DeviceInventory();i.setDevice(d);i.setFactoryMac(null);i.setState(DeviceInventory.AWAITING_FLASH);
   inventory.saveAndFlush(i);
  }});
  assertThat(inventory.count()).isEqualTo(before+2);
 }
 @Test void pendingDeviceHasNoIdentityUntilFlashed(){
  var view=pending();
  assertThat(view.state()).isEqualTo("AWAITING_FLASH");assertThat(view.factoryMac()).isNull();
  assertThat(view.deviceUid()).matches("PENDING-[0-9A-F]{12}");
  assertThatThrownBy(()->authentication.authenticate(view.deviceUid(),"x".repeat(32))).isInstanceOf(RuntimeException.class);
  login(owner);assertThatThrownBy(this::pending).isInstanceOf(RuntimeException.class);
 }
 @Test void flashJobBindsMacProvisionsChipAndIssuesQr() throws Exception{
  var view=pending();var job=flash(view.deviceId());
  assertThat(job.stage()).isEqualTo(Stage.DONE);
  var i=stored(view.deviceId());
  assertThat(i.getState()).isEqualTo("INVENTORY");assertThat(i.getFactoryMac()).isEqualTo(mac);
  assertThat(i.getFlashedReleaseId()).isEqualTo(release);assertThat(i.getFlashedAt()).isNotNull();
  assertThat(devices.findById(view.deviceId()).orElseThrow().getDeviceUid()).isEqualTo("ESP32-"+mac);
  var result=provisioning.job(job.jobId()).result();
  assertThat(result.deviceSecret()).isNull();assertThat(result.setupSsid()).isEqualTo("SmartDoor-"+mac.substring(6));
  assertThat(deployment.inspect(result.activationCode()).deviceUid()).isEqualTo("ESP32-"+mac);
  var passwordCaptor=ArgumentCaptor.forClass(String.class);
  InOrder order=inOrder(usb,brokers);
  order.verify(usb).read("COM5");order.verify(brokers).upsertDevice(eq("ESP32-"+mac),passwordCaptor.capture());
  order.verify(usb).flash(eq("COM5"),any());order.verify(usb).provision(eq("COM5"),anyString());
  var bundle=json.readTree(sentBundle(1));
  Set<String> keys=new HashSet<>();bundle.fieldNames().forEachRemaining(keys::add);
  assertThat(keys).containsExactlyInAnyOrder("deviceUid","factoryMac","deviceSecret","generation","activationCode","setupSsid",
   "setupPassword","mqttHost","mqttPort","mqttUser","mqttPassword","mqttTls","allowLocalPlaintext");
  assertThat(bundle.path("mqttPassword").asText()).isEqualTo(passwordCaptor.getValue());
  assertThat(bundle.path("activationCode").asText()).isEqualTo(result.activationCode());
  assertThat(authentication.authenticate("ESP32-"+mac,bundle.path("deviceSecret").asText()).getDeviceId()).isEqualTo(view.deviceId());
 }
 @Test void rejectsChipOwnedByAnotherDeviceBeforeErasing(){
  deployment.register(mac,"Cửa cũ");clearInvocations(brokers);var view=pending();
  var job=flash(view.deviceId());
  assertThat(job.stage()).isEqualTo(Stage.FAILED);assertThat(job.error()).contains("ESP32-"+mac);
  verify(usb,never()).flash(any(),any());verifyNoInteractions(brokers);
  assertThat(stored(view.deviceId()).getFactoryMac()).isNull();
 }
 @Test void claimedDeviceCannotBeReflashed(){
  var issued=deployment.register(mac,"Đã bán");
  tx.executeWithoutResult(s->{Device d=devices.findById(issued.device().deviceId()).orElseThrow();d.setLifecycleStatus(DeviceLifecycleStatus.ACTIVE);d.setLastSeenAt(LocalDateTime.now());});
  login(owner);deployment.claim(issued.activationCode(),"Nhà tôi");login(admin);
  assertThatThrownBy(()->flash(issued.device().deviceId())).isInstanceOf(RuntimeException.class);
  verify(usb,never()).read(any());
 }
 @Test void failedProvisionCanBeRetriedWithFreshSecrets() throws Exception{
  var view=pending();
  doThrow(new BusinessException(org.springframework.http.HttpStatus.CONFLICT,"Chip từ chối gói cấp phát")).when(usb).provision(eq("COM5"),anyString());
  var first=flash(view.deviceId());
  assertThat(first.stage()).isEqualTo(Stage.FAILED);assertThat(first.failedAt()).isEqualTo(Stage.PROVISIONING);
  var i=stored(view.deviceId());
  assertThat(i.getState()).isEqualTo("AWAITING_FLASH");assertThat(i.getFactoryMac()).isEqualTo(mac);assertThat(i.getClaimHash()).isNull();
  String firstCode=json.readTree(sentBundle(1)).path("activationCode").asText();
  doAnswer(inv->new UsbDeviceService.Provisioned(mac,"ESP32-"+mac,"9.0.0")).when(usb).provision(eq("COM5"),anyString());
  var second=flash(view.deviceId());
  assertThat(second.stage()).isEqualTo(Stage.DONE);
  String secondCode=json.readTree(sentBundle(2)).path("activationCode").asText();
  assertThat(secondCode).isNotEqualTo(firstCode);
  assertThatThrownBy(()->deployment.inspect(firstCode)).isInstanceOf(RuntimeException.class);
  assertThat(deployment.inspect(secondCode).deviceUid()).isEqualTo("ESP32-"+mac);
 }
 @Test void brokerFailureStopsBeforeErasingChip(){
  var view=pending();
  doThrow(new BusinessException(org.springframework.http.HttpStatus.BAD_GATEWAY,"Broker MQTT chưa tạo được tài khoản thiết bị")).when(brokers).upsertDevice(anyString(),anyString());
  var job=flash(view.deviceId());
  assertThat(job.stage()).isEqualTo(Stage.FAILED);assertThat(job.failedAt()).isEqualTo(Stage.BROKER);
  assertThat(job.error()).contains("Broker MQTT");
  verify(usb,never()).flash(any(),any());
 }
 @Test void secondJobForSameDeviceIsRejected(){
  var view=pending();executor.hold=true;
  var job=flash(view.deviceId());assertThat(job.stage()).isEqualTo(Stage.READING_MAC);
  assertThatThrownBy(()->flash(view.deviceId())).isInstanceOf(RuntimeException.class).hasMessageContaining("Thiết bị đang được nạp");
  executor.held.forEach(Runnable::run);
  assertThat(provisioning.job(job.jobId()).stage()).isEqualTo(Stage.DONE);
 }
 @Test void releaseWithoutFactoryImageIsRejected(){
  var view=pending();
  assertThatThrownBy(()->provisioning.start(view.deviceId(),"COM5",bareRelease,PASSWORD)).isInstanceOf(RuntimeException.class).hasMessageContaining("factory image");
  verifyNoInteractions(brokers);verify(usb,never()).read(any());
 }
 @Test void wrongPasswordIsRejected(){
  var view=pending();
  assertThatThrownBy(()->provisioning.start(view.deviceId(),"COM5",release,"wrong")).isInstanceOf(RuntimeException.class);
  verify(usb,never()).read(any());
 }
 @Test void jobViewNeverContainsSecrets() throws Exception{
  var view=pending();var job=flash(view.deviceId());
  var bundle=json.readTree(sentBundle(1));
  String serialized=json.writeValueAsString(provisioning.job(job.jobId()));
  assertThat(serialized).doesNotContain(bundle.path("deviceSecret").asText()).doesNotContain(bundle.path("mqttPassword").asText());
 }
 @Test void nonCreatorCannotReadJobResult(){
  var view=pending();var job=flash(view.deviceId());
  login(otherAdmin);var seen=provisioning.job(job.jobId());
  assertThat(seen.stage()).isEqualTo(Stage.DONE);assertThat(seen.result()).isNull();
  login(owner);assertThatThrownBy(()->provisioning.job(job.jobId())).isInstanceOf(RuntimeException.class);
 }
 @Test void deletePendingOnlyBeforeFlash(){
  var fresh=pending();deployment.deletePending(fresh.deviceId());
  assertThat(inventory.findById(fresh.deviceId())).isEmpty();assertThat(devices.findById(fresh.deviceId())).isEmpty();
  var flashed=pending();flash(flashed.deviceId());
  assertThatThrownBy(()->deployment.deletePending(flashed.deviceId())).isInstanceOf(RuntimeException.class);
 }
 @Test void deviceCannotBeDeletedWhileItIsBeingFlashed(){
  var view=pending();executor.hold=true;flash(view.deviceId());
  assertThatThrownBy(()->provisioning.deletePending(view.deviceId())).isInstanceOf(RuntimeException.class).hasMessageContaining("đang được nạp");
  executor.held.forEach(Runnable::run);
  assertThat(stored(view.deviceId()).getState()).isEqualTo("INVENTORY");
 }
 @Test void legacyRegisterCreatesBrokerAccountAndReturnsConnection(){
  var issued=deployment.register(mac,"CLI");
  verify(brokers).upsertDevice(eq("ESP32-"+mac),anyString());
  assertThat(issued.connection()).containsEntry("mqttUser","ESP32-"+mac).containsEntry("mqttHost","192.168.1.10");
 }

 @Test void browserFlashWorksWithBackendUsbDisabledAndOnlyIssuesQrAfterReadback() throws Exception {
  when(usb.enabled()).thenReturn(false);
  var device=pending();
  var session=provisioning.prepareBrowser(device.deviceId(),colonMac,release,PASSWORD);
  assertThat(stored(device.deviceId()).getClaimHash()).isNull();
  assertThat(stored(device.deviceId()).getState()).isEqualTo("AWAITING_FLASH");
  assertThat(provisioning.browserImage(session.jobId())).containsExactly((byte)0xE9,(byte)1,(byte)2);
  assertThat(session.payload()).containsEntry("factoryMac",mac).containsEntry("deviceUid","ESP32-"+mac);
  String jobJson=json.writeValueAsString(provisioning.job(session.jobId()));
  assertThat(jobJson).doesNotContain((String)session.payload().get("deviceSecret"))
    .doesNotContain((String)session.payload().get("mqttPassword"));
  var done=provisioning.completeBrowser(session.jobId(),mac,"ESP32-"+mac);
  assertThat(done.stage()).isEqualTo(Stage.DONE);
  assertThat(deployment.inspect(done.result().activationCode()).deviceUid()).isEqualTo("ESP32-"+mac);
  assertThat(provisioning.completeBrowser(session.jobId(),mac,"ESP32-"+mac)).isEqualTo(done);
  assertThatThrownBy(()->provisioning.browserImage(session.jobId())).isInstanceOf(BusinessException.class);
  verifyNoInteractions(usb);
 }
 @Test void browserSessionRejectsOtherAdminsAndNonAdmins(){
  var session=provisioning.prepareBrowser(pending().deviceId(),colonMac,release,PASSWORD);
  login(otherAdmin);
  assertThatThrownBy(()->provisioning.browserImage(session.jobId())).isInstanceOf(BusinessException.class);
  assertThatThrownBy(()->provisioning.completeBrowser(session.jobId(),mac,"ESP32-"+mac)).isInstanceOf(BusinessException.class);
  assertThatThrownBy(()->provisioning.cancelBrowser(session.jobId())).isInstanceOf(BusinessException.class);
  login(owner);
  assertThatThrownBy(()->provisioning.browserImage(session.jobId())).isInstanceOf(BusinessException.class);
  login(admin);provisioning.cancelBrowser(session.jobId());
 }
 @Test void browserSessionLocksAgainstBackendFlashAndDeleteAndCancelAllowsRetry(){
  var device=pending();var session=provisioning.prepareBrowser(device.deviceId(),colonMac,release,PASSWORD);
  assertThatThrownBy(()->flash(device.deviceId())).hasMessageContaining("đang được nạp");
  assertThatThrownBy(()->provisioning.deletePending(device.deviceId())).hasMessageContaining("đang được nạp");
  assertThatThrownBy(()->provisioning.completeBrowser(session.jobId(),mac,"wrong-uid")).hasMessageContaining("khác gói");
  assertThat(stored(device.deviceId()).getClaimHash()).isNull();
  provisioning.cancelBrowser(session.jobId());
  assertThatThrownBy(()->provisioning.completeBrowser(session.jobId(),mac,"ESP32-"+mac)).hasMessageContaining("kết thúc");
  var retry=provisioning.prepareBrowser(device.deviceId(),colonMac,release,PASSWORD);
  assertThat(retry.payload().get("deviceSecret")).isNotEqualTo(session.payload().get("deviceSecret"));
  provisioning.cancelBrowser(retry.jobId());
 }
 @Test void browserPrepareRejectsBadPasswordMissingImageAndOccupiedChip(){
  var device=pending();
  assertThatThrownBy(()->provisioning.prepareBrowser(device.deviceId(),colonMac,release,"bad")).isInstanceOf(BusinessException.class);
  assertThatThrownBy(()->provisioning.prepareBrowser(device.deviceId(),colonMac,bareRelease,PASSWORD)).hasMessageContaining("factory image");
  assertThatThrownBy(()->provisioning.prepareBrowser(device.deviceId(),"00:00:00:00:00:00",release,PASSWORD)).hasMessageContaining("MAC");
  deployment.register(mac,"Cửa đang dùng");clearInvocations(brokers);
  assertThatThrownBy(()->provisioning.prepareBrowser(device.deviceId(),colonMac,release,PASSWORD)).hasMessageContaining("đã thuộc");
  verifyNoInteractions(brokers,usb);
 }
 @Test void browserBrokerFailureReleasesLockWithoutIssuingClaim(){
  var device=pending();
  doThrow(new BusinessException(org.springframework.http.HttpStatus.BAD_GATEWAY,"Broker lỗi")).when(brokers).upsertDevice(anyString(),anyString());
  assertThatThrownBy(()->provisioning.prepareBrowser(device.deviceId(),colonMac,release,PASSWORD)).hasMessageContaining("Broker lỗi");
  assertThat(stored(device.deviceId()).getClaimHash()).isNull();
  reset(brokers);
  var session=provisioning.prepareBrowser(device.deviceId(),colonMac,release,PASSWORD);
  provisioning.cancelBrowser(session.jobId());
 }
 @Test void abandonedBrowserSessionExpiresAndReleasesDevice() throws Exception {
  var device=pending();var session=provisioning.prepareBrowser(device.deviceId(),colonMac,release,PASSWORD);
  var field=DeviceProvisioningService.class.getDeclaredField("jobs");field.setAccessible(true);
  Object job=((Map<?,?>)field.get(provisioning)).get(session.jobId());
  var expires=job.getClass().getDeclaredField("expiresAt");expires.setAccessible(true);
  expires.set(job,java.time.Instant.now().minusSeconds(1));
  provisioning.expireBrowserSessions();
  assertThat(provisioning.job(session.jobId()).stage()).isEqualTo(Stage.FAILED);
  assertThatThrownBy(()->provisioning.browserImage(session.jobId())).isInstanceOf(BusinessException.class);
  var bundle=job.getClass().getDeclaredField("bundle");bundle.setAccessible(true);assertThat(bundle.get(job)).isNull();
  assertThat(stored(device.deviceId()).getClaimHash()).isNull();
  var retry=provisioning.prepareBrowser(device.deviceId(),colonMac,release,PASSWORD);
  provisioning.cancelBrowser(retry.jobId());
 }
}
