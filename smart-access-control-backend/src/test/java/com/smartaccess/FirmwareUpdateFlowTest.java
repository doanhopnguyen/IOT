package com.smartaccess;

import com.smartaccess.model.*;
import com.smartaccess.model.enumtype.*;
import com.smartaccess.repository.*;
import com.smartaccess.security.AccountPrincipal;
import com.smartaccess.service.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.*;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.LocalDateTime;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.NONE,properties={
    "spring.datasource.url=jdbc:h2:mem:firmware;MODE=MySQL;DB_CLOSE_DELAY=-1","spring.datasource.username=sa","spring.datasource.password=",
    "spring.datasource.driver-class-name=org.h2.Driver","spring.flyway.enabled=false","spring.jpa.hibernate.ddl-auto=create-drop",
    "app.firmware.device-base-url=http://192.168.1.10:8080"})
class FirmwareUpdateFlowTest {
    static int sequence=0;
    @TestConfiguration static class Config { @Bean @Primary DeviceGateway gateway(){return (uid,id,type,data)->{};} }
    @Autowired FirmwareUpdateService firmware;
    @Autowired DeploymentService deployment;
    @Autowired AccountRepository accounts;
    @Autowired DeviceRepository devices;
    @Autowired DeviceInventoryRepository inventory;
    @Autowired CommandRepository commands;
    @Autowired CommandAckService acknowledgements;
    @Autowired RemoteUnlockService remote;
    @Autowired TransactionTemplate tx;
    Long admin,owner,stranger,unit;String uid,secret,version;
    void login(Long id){SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(new AccountPrincipal(id),null,AuthorityUtils.createAuthorityList("ROLE_USER")));}
    Long account(boolean admin){Account a=new Account();a.setFullName("OTA test");a.setEmail(UUID.randomUUID()+"@example.test");a.setPasswordHash("test-hash");a.setAdmin(admin);return accounts.saveAndFlush(a).getAccountId();}
    @BeforeEach void setup(){
        admin=account(true);owner=account(false);stranger=account(false);int seq=++sequence;version="2."+seq+".0-demo";
        login(admin);var issued=deployment.register(String.format("%012X",0xB000000000L+seq),"OTA fixture");uid=issued.device().deviceUid();secret=issued.deviceSecret();
        tx.executeWithoutResult(s->{Device d=devices.findByDeviceUid(uid).orElseThrow();d.setLifecycleStatus(DeviceLifecycleStatus.ACTIVE);d.setLastSeenAt(LocalDateTime.now());d.setFirmwareVersion("1.13.0");d.setHardwareVersion("esp32s3-n16r8");});
        login(owner);unit=deployment.claim(issued.activationCode(),"OTA door").unitId();
        tx.executeWithoutResult(s->{Device d=devices.findByDeviceUid(uid).orElseThrow();d.setLifecycleStatus(DeviceLifecycleStatus.ACTIVE);d.getAccessUnit().setPinEnabled(true);var i=inventory.findById(d.getDeviceId()).orElseThrow();i.setState("ACTIVE");i.setSetupReady(true);i.setDoorClosed(true);i.setLatchReleased(false);});
    }
    @AfterEach void clearContext(){SecurityContextHolder.clearContext();}
    byte[] image(){byte[] data=new byte[1024];data[0]=(byte)0xE9;data[1]=1;data[12]=9;data[32]=0x32;data[33]=0x54;data[34]=(byte)0xCD;data[35]=(byte)0xAB;
        byte[] tag=("SMARTDOOR_OTA_V1|"+version+'\0').getBytes(java.nio.charset.StandardCharsets.US_ASCII);System.arraycopy(tag,0,data,100,tag.length);return data;}
    FirmwareUpdateService.ReleaseView publish(){login(admin);return firmware.publish(version,"v2.0 demo","esp32s3-n16r8","Black buttons",new MockMultipartFile("file","demo.bin","application/octet-stream",image()));}
    @Test void onlyAdminCanPublishAndPublishedBytesAreImmutable(){
        login(owner);assertThatThrownBy(()->firmware.publish(version,"demo","esp32s3-n16r8","",new MockMultipartFile("file",image()))).isInstanceOf(RuntimeException.class);
        var r=publish();assertThat(r.sha256()).hasSize(64);assertThat(r.size()).isEqualTo(1024);
        assertThatThrownBy(this::publish).isInstanceOf(RuntimeException.class);
    }
    @Test void wrongChipAndBadFilesAreRejected(){
        login(admin);
        assertThatThrownBy(()->firmware.publish(version,"demo","esp32","",new MockMultipartFile("file",image()))).isInstanceOf(RuntimeException.class);
        byte[] data=image();data[12]=0;
        assertThatThrownBy(()->firmware.publish(version,"demo","esp32s3-n16r8","",new MockMultipartFile("file",data))).isInstanceOf(RuntimeException.class);
        assertThatThrownBy(()->firmware.publish(version,"demo","esp32s3-n16r8","",new MockMultipartFile("file",new byte[0]))).isInstanceOf(RuntimeException.class);
        assertThatThrownBy(()->firmware.publish("3.0.0","demo","esp32s3-n16r8","",new MockMultipartFile("file",image()))).isInstanceOf(RuntimeException.class);
    }
    @Test void ownerSeesPublishedUpdateButNoInstallHappensBeforeConsent(){
        var r=publish();login(owner);
        assertThat(firmware.status(owner,unit).available()).extracting(FirmwareUpdateService.ReleaseView::id).contains(r.id());
        assertThat(firmware.status(owner,unit).update()).isNull();
        assertThatThrownBy(()->firmware.install(owner,unit,r.id(),false)).isInstanceOf(RuntimeException.class);
        assertThatThrownBy(()->firmware.install(admin,unit,r.id(),true)).isInstanceOf(RuntimeException.class);
        assertThatThrownBy(()->firmware.install(stranger,unit,r.id(),true)).isInstanceOf(RuntimeException.class);
    }
    @Test void downloadNeedsDeviceAuthenticationAndMatchingPendingUpdate(){
        var r=publish();login(owner);
        assertThatThrownBy(()->firmware.download(uid,secret,r.id())).isInstanceOf(RuntimeException.class);
        var command=firmware.install(owner,unit,r.id(),true);
        assertThat(command.status().toString()).isIn("PENDING","SENT");
        assertThatThrownBy(()->firmware.download(uid,"wrong-password",r.id())).isInstanceOf(RuntimeException.class);
        assertThat(firmware.download(uid,secret,r.id()).getImage()).containsExactly(image());
        assertThatThrownBy(()->firmware.install(owner,unit,r.id(),true)).isInstanceOf(RuntimeException.class);
        assertThatThrownBy(()->remote.unlock(owner,unit)).isInstanceOf(RuntimeException.class);
    }
    @Test void arbitrarySuccessDoesNotCompleteUntilTheNewBootReportsTheExpectedVersion(){
        var r=publish();login(owner);var command=firmware.install(owner,unit,r.id(),true);
        acknowledgements.handleAck(uid,command.commandUuid(),true,"OK");
        assertThat(commands.findByCommandUuid(command.commandUuid()).orElseThrow().getStatus()).isEqualTo(CommandStatus.FAILED);
        var retry=firmware.install(owner,unit,r.id(),true);
        acknowledgements.handleAck(uid,retry.commandUuid(),true,"FIRMWARE_UPDATED:"+version);
        assertThat(commands.findByCommandUuid(retry.commandUuid()).orElseThrow().getStatus()).isEqualTo(CommandStatus.ACKNOWLEDGED);
        assertThatThrownBy(()->firmware.download(uid,secret,r.id())).isInstanceOf(RuntimeException.class);
    }
    @Test void incompatibleOrAlreadyInstalledVersionsCannotBeReapplied(){
        var r=publish();login(owner);
        tx.executeWithoutResult(s->devices.findByDeviceUid(uid).orElseThrow().setHardwareVersion("other-chip"));
        assertThatThrownBy(()->firmware.install(owner,unit,r.id(),true)).isInstanceOf(RuntimeException.class);
        tx.executeWithoutResult(s->{Device d=devices.findByDeviceUid(uid).orElseThrow();d.setHardwareVersion("esp32s3-n16r8");d.setFirmwareVersion(version);});
        assertThatThrownBy(()->firmware.install(owner,unit,r.id(),true)).isInstanceOf(RuntimeException.class);
    }
    @Test void semanticVersionsDoNotOfferAnOlderMajorAsANewUpdate(){
        assertThat(FirmwareUpdateService.compareVersion("2.0.0-demo","1.13.0")).isPositive();
        assertThat(FirmwareUpdateService.compareVersion("1.13.0","2.0.0-demo")).isNegative();
        assertThat(FirmwareUpdateService.compareVersion("2.0.0","2.0.0-demo")).isPositive();
    }
}
