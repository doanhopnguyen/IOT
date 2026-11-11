package com.smartaccess.service;

import com.smartaccess.dto.manager.CommandResponse;
import com.smartaccess.model.*;
import com.smartaccess.model.enumtype.*;
import com.smartaccess.repository.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import java.net.URI;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.*;
import static org.springframework.http.HttpStatus.*;

@Service @Transactional
public class FirmwareUpdateService {
    public static final String COMMAND="FIRMWARE_UPDATE";
    public static final int MAX_IMAGE_SIZE=4*1024*1024;
    public static final int MAX_FACTORY_SIZE=16*1024*1024;
    /** Offset của app trong factory image (sau bootloader 0x0, partitions 0x8000, boot_app0 0xe000). */
    public static final int FACTORY_APP_OFFSET=0x10000;
    public static final List<CommandStatus> IN_FLIGHT=List.of(CommandStatus.PENDING,CommandStatus.SENT);
    public record ReleaseView(Long id,String version,String label,String hardwareVersion,String notes,String sha256,int size,LocalDateTime publishedAt,boolean flashable) {
        static ReleaseView of(FirmwareRelease r){return new ReleaseView(r.getReleaseId(),r.getVersion(),r.getLabel(),r.getHardwareVersion(),r.getNotes(),r.getSha256(),r.getImageSize(),r.getPublishedAt(),r.getFactorySha256()!=null);}
    }
    public record Status(String currentVersion,String hardwareVersion,boolean online,boolean capable,
                         List<ReleaseView> available,CommandResponse update,String targetVersion) {}
    private final FirmwareReleaseRepository releases;
    private final CurrentAccountService current;
    private final ManagerAccessGuard guard;
    private final DeviceRepository devices;
    private final DeviceInventoryRepository inventory;
    private final CommandRepository commands;
    private final DeviceCommandService dispatcher;
    private final DeviceAuthenticationService authentication;
    private final String baseUrl;

    public FirmwareUpdateService(FirmwareReleaseRepository releases,CurrentAccountService current,ManagerAccessGuard guard,
            DeviceRepository devices,DeviceInventoryRepository inventory,CommandRepository commands,
            DeviceCommandService dispatcher,DeviceAuthenticationService authentication,
            @Value("${app.firmware.device-base-url:http://127.0.0.1:8080}") String baseUrl) {
        this.releases=releases;this.current=current;this.guard=guard;this.devices=devices;this.inventory=inventory;
        this.commands=commands;this.dispatcher=dispatcher;this.authentication=authentication;
        this.baseUrl=baseUrl.replaceAll("/+$","");
    }
    private static ResponseStatusException reject(org.springframework.http.HttpStatus status,String message){return new ResponseStatusException(status,message);}
    private Account admin(){Account a=current.requireAccount();if(!a.isAdmin())throw reject(FORBIDDEN,"Chỉ admin hệ thống được phát hành firmware");return a;}
    @Transactional(readOnly=true) public List<ReleaseView> list(){admin();return releases.findAllByOrderByReleaseIdDesc().stream().map(ReleaseView::of).toList();}
    public ReleaseView publish(String version,String label,String hardware,String notes,MultipartFile file) {
        return publish(version,label,hardware,notes,file,null);
    }
    /** factoryImage (không bắt buộc): ảnh gộp để nạp chip trắng; phải chứa đúng app ở offset 0x10000. */
    public ReleaseView publish(String version,String label,String hardware,String notes,MultipartFile file,MultipartFile factoryImage) {
        Account actor=admin();
        if(version==null||!version.matches("[0-9]{1,4}\\.[0-9]{1,4}\\.[0-9]{1,4}(?:-[a-zA-Z0-9.]{1,30})?")||version.length()>50)
            throw reject(BAD_REQUEST,"Phiên bản cần dạng 2.0.0-demo");
        if(label==null||label.isBlank()||label.length()>100||!"esp32s3-n16r8".equals(hardware)||notes==null||notes.length()>2000)
            throw reject(BAD_REQUEST,"Tên, nội dung hoặc phần cứng không hợp lệ");
        if(file==null||file.isEmpty()||file.getSize()>MAX_IMAGE_SIZE)throw reject(BAD_REQUEST,"Chọn firmware .bin của ESP32-S3, tối đa 4 MiB");
        if(releases.existsByVersionAndHardwareVersion(version,hardware))throw reject(CONFLICT,"Phiên bản này đã được phát hành; không được thay nội dung bản đã phát hành");
        try {
            byte[] bytes=file.getBytes();
            if(bytes.length<256||(bytes[0]&255)!=0xE9||(bytes[12]&255)!=9||bytes[13]!=0||
               (bytes[32]&255)!=0x32||(bytes[33]&255)!=0x54||(bytes[34]&255)!=0xCD||(bytes[35]&255)!=0xAB)
                throw reject(BAD_REQUEST,"Tệp không phải ứng dụng firmware ESP32-S3");
            byte[] identity=("SMARTDOOR_OTA_V1|"+version+'\0').getBytes(java.nio.charset.StandardCharsets.US_ASCII);
            boolean matches=false;
            outer:for(int i=0;i<=bytes.length-identity.length;i++){
                for(int j=0;j<identity.length;j++)if(bytes[i+j]!=identity[j])continue outer;
                matches=true;break;
            }
            if(!matches)throw reject(BAD_REQUEST,"Tệp không phải firmware Smart Door có OTA hoặc phiên bản nhập không khớp tệp");
            FirmwareRelease r=new FirmwareRelease();r.setVersion(version);r.setLabel(label.trim());r.setHardwareVersion(hardware);
            r.setNotes(notes.trim());r.setImage(bytes);r.setImageSize(bytes.length);
            r.setSha256(HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)));
            if(factoryImage!=null && !factoryImage.isEmpty()) {
                if(factoryImage.getSize()>MAX_FACTORY_SIZE)throw reject(BAD_REQUEST,"Factory image tối đa 16 MiB");
                byte[] factory=factoryImage.getBytes();
                if(factory.length<FACTORY_APP_OFFSET+bytes.length||(factory[0]&255)!=0xE9)
                    throw reject(BAD_REQUEST,"Tệp factory image không phải ảnh nạp ESP32-S3 (bootloader ở 0x0)");
                // ROM ESP32-S3 phải đọc bootloader ở DIO/DOUT; header QIO làm chip kẹt vòng reset (ets_loader.c 78).
                if(factory[2]!=2 && factory[2]!=3)
                    throw reject(BAD_REQUEST,"Factory image phải giữ chế độ flash DIO của bootloader; gộp ảnh không dùng --flash_mode qio");
                if(!Arrays.equals(factory,FACTORY_APP_OFFSET,FACTORY_APP_OFFSET+bytes.length,bytes,0,bytes.length))
                    throw reject(BAD_REQUEST,"Tệp factory image không chứa đúng firmware của bản phát hành này");
                r.setFactoryImage(factory);r.setFactorySize(factory.length);
                r.setFactorySha256(HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(factory)));
            }
            r.setPublishedAt(LocalDateTime.now());r.setPublishedBy(actor);
            return ReleaseView.of(releases.saveAndFlush(r));
        } catch(java.io.IOException|java.security.NoSuchAlgorithmException e){throw reject(BAD_REQUEST,"Không đọc được firmware");}
    }
    private Device controller(Long unitId){return devices.findFirstByAccessUnit_UnitIdAndDeviceType(unitId,DeviceType.DOOR_CONTROLLER).orElseThrow(()->reject(NOT_FOUND,"Cửa chưa có bộ điều khiển"));}
    private long generation(Device d){return inventory.findById(d.getDeviceId()).map(DeviceInventory::getGeneration).orElse(0L);}
    private Optional<Command> latest(Device d) {
        long generation=generation(d);
        return commands.findFirstByDevice_DeviceIdAndCommandTypeOrderByCommandIdDesc(d.getDeviceId(),COMMAND)
            .filter(c->c.getPayload()!=null&&c.getPayload().get("generation") instanceof Number g&&g.longValue()==generation);
    }
    public static int compareVersion(String left,String right) {
        try {
            String[] a=left.split("-",2),b=right.split("-",2),aa=a[0].split("\\."),bb=b[0].split("\\.");
            if(aa.length!=3||bb.length!=3)return -1;
            for(int i=0;i<3;i++){int cmp=Integer.compare(Integer.parseInt(aa[i]),Integer.parseInt(bb[i]));if(cmp!=0)return cmp;}
            if(a.length==b.length)return a.length==1?0:a[1].compareTo(b[1]);
            return a.length==1?1:-1;
        } catch(RuntimeException e){return -1;}
    }
    @Transactional(readOnly=true) public Status status(Long actor,Long unitId) {
        guard.requireManagedUnit(actor,unitId);Device d=controller(unitId);
        boolean online=d.getLifecycleStatus()==DeviceLifecycleStatus.ACTIVE&&d.getLastSeenAt()!=null&&d.getLastSeenAt().isAfter(LocalDateTime.now().minusSeconds(90));
        boolean capable=d.getFirmwareVersion()!=null&&compareVersion(d.getFirmwareVersion(),"1.13.0")>=0;
        List<ReleaseView> available=d.getHardwareVersion()==null?List.of():releases.findByHardwareVersionOrderByReleaseIdDesc(d.getHardwareVersion()).stream()
            .filter(r->d.getFirmwareVersion()!=null&&compareVersion(r.getVersion(),d.getFirmwareVersion())>0).map(ReleaseView::of).toList();
        var latest=latest(d);
        return new Status(d.getFirmwareVersion(),d.getHardwareVersion(),online,capable,available,
            latest.map(CommandResponse::from).orElse(null),latest.map(c->String.valueOf(c.getPayload().get("version"))).orElse(null));
    }
    public CommandResponse install(Long actor,Long unitId,Long releaseId,boolean consent) {
        guard.requireManagedUnit(actor,unitId);
        if(!consent)throw reject(BAD_REQUEST,"Chủ cửa cần xác nhận đồng ý cập nhật");
        Device online=guard.requireReadyController(unitId);
        Device d=devices.findByDeviceUidForUpdate(online.getDeviceUid()).orElseThrow();
        if(d.getFirmwareVersion()==null||compareVersion(d.getFirmwareVersion(),"1.13.0")<0)throw reject(CONFLICT,"Cửa cần bản cơ sở có OTA từ 1.13.0");
        if(commands.existsByDevice_DeviceIdAndCommandTypeAndStatusIn(d.getDeviceId(),COMMAND,IN_FLIGHT))throw reject(CONFLICT,"Cửa đang cập nhật firmware");
        FirmwareRelease r=releases.findById(releaseId).orElseThrow(()->reject(NOT_FOUND,"Không tìm thấy bản cập nhật"));
        if(!r.getHardwareVersion().equals(d.getHardwareVersion())||compareVersion(r.getVersion(),d.getFirmwareVersion())<=0)
            throw reject(CONFLICT,"Bản cập nhật không phù hợp với cửa hoặc đã được cài");
        URI endpoint=URI.create(baseUrl);
        if(!Set.of("http","https").contains(endpoint.getScheme())||endpoint.getHost()==null||Set.of("localhost","127.0.0.1","::1").contains(endpoint.getHost()))
            throw reject(SERVICE_UNAVAILABLE,"Chưa cấu hình địa chỉ tải firmware mà ESP32 truy cập được");
        Map<String,Object> payload=Map.of("unitId",unitId,"releaseId",r.getReleaseId(),"version",r.getVersion(),"generation",generation(d));
        return CommandResponse.from(dispatcher.dispatch(d,actor,COMMAND,payload,Map.of("releaseId",r.getReleaseId(),"version",r.getVersion(),
            "size",r.getImageSize(),"sha256",r.getSha256(),"url",baseUrl+"/api/device/firmware/"+r.getReleaseId()+"/download")));
    }
    @Transactional(readOnly=true) public FirmwareRelease download(String uid,String secret,Long releaseId) {
        Device d=authentication.authenticate(uid,secret);
        Command pending=latest(d).filter(c->IN_FLIGHT.contains(c.getStatus())&&c.getPayload().get("releaseId") instanceof Number id&&id.longValue()==releaseId)
            .orElseThrow(()->reject(FORBIDDEN,"Không có yêu cầu cập nhật hợp lệ cho thiết bị này"));
        if(pending.getRequestedAt().isBefore(LocalDateTime.now().minusMinutes(5)))throw reject(FORBIDDEN,"Yêu cầu cập nhật đã hết hạn");
        return releases.findById(releaseId).orElseThrow(()->reject(NOT_FOUND,"Không tìm thấy firmware"));
    }
}
