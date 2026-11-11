package com.smartaccess.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartaccess.exception.BusinessException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import static org.springframework.http.HttpStatus.*;

/**
 * USB gắn vào máy chạy backend: đọc MAC, ghi factory image và nạp gói cấp phát.
 * Chỉ chạy helper cố định trong classpath với tham số đã kiểm tra; bí mật đi qua stdin.
 */
@Service
public class UsbDeviceService {
    public record Port(String device,String description){}
    public record Mac(String port,String factoryMac,String chip){}
    public record Available(boolean enabled,List<Port> ports){}
    public record Provisioned(String factoryMac,String uid,String firmware){}
    private static final String READER="usb/read_device_mac.py",PROVISIONER="usb/provision_device.py";
    private final ObjectMapper json;private final boolean enabled;private final String python,esptool;
    private final Semaphore connection=new Semaphore(1);
    public UsbDeviceService(ObjectMapper json,@Value("${app.usb.enabled:false}") boolean enabled,
            @Value("${app.usb.python-executable:python}") String python,@Value("${app.usb.esptool-script:}") String esptool){
        this.json=json;this.enabled=enabled;this.python=python;this.esptool=esptool;
    }
    public boolean enabled(){return enabled;}
    public Available list(){
        if(!enabled)return new Available(false,List.of());
        JsonNode result=run(READER,List.of("--list"),null,18);List<Port> ports=new ArrayList<>();
        for(JsonNode port:result.path("ports"))ports.add(new Port(port.path("device").asText(),port.path("description").asText()));
        return new Available(true,ports);
    }
    public Mac read(String input){
        String port=port(input);
        JsonNode result=run(READER,List.of("--port",port,"--esptool",esptool),null,18);
        String mac=result.path("factoryMac").asText();
        if(!mac.matches("[0-9A-F]{2}(:[0-9A-F]{2}){5}"))throw new BusinessException(BAD_GATEWAY,"Không xác minh được MAC của chip");
        return new Mac(result.path("port").asText(),mac,result.path("chip").asText());
    }
    /** Xoá toàn bộ flash rồi ghi factory image ở 0x0. Người gọi chịu trách nhiệm kiểm tra chip đúng trước. */
    public void flash(String input,byte[] image){
        String port=port(input);
        if(image==null||image.length==0)throw new BusinessException(BAD_REQUEST,"Bản firmware chưa có factory image");
        Path file=null;
        try{
            file=Files.createTempFile("smartdoor-factory-",".bin");Files.write(file,image);
            JsonNode result=run(PROVISIONER,List.of("--flash","--port",port,"--image",file.toString(),"--esptool",esptool),null,240);
            if(!result.path("written").asBoolean())throw new BusinessException(BAD_GATEWAY,"Chưa ghi được firmware vào chip");
        }catch(java.io.IOException e){throw new BusinessException(SERVICE_UNAVAILABLE,"Không tạo được tệp tạm để ghi firmware");}
        finally{if(file!=null)try{Files.deleteIfExists(file);}catch(Exception ignored){}}
    }
    /** Gửi gói FACTORY (qua stdin) và xác minh bằng INFO sau khi chip khởi động lại. */
    public Provisioned provision(String input,String bundleJson){
        String port=port(input);
        JsonNode result=run(PROVISIONER,List.of("--provision","--port",port),bundleJson,150);
        return new Provisioned(result.path("factoryMac").asText(),result.path("uid").asText(),result.path("firmware").asText());
    }
    private String port(String input){
        if(input==null || !input.matches("(?i)COM[1-9][0-9]{0,3}"))throw new BusinessException(BAD_REQUEST,"Cổng USB không hợp lệ");
        if(!enabled)throw new BusinessException(SERVICE_UNAVAILABLE,"Backend chưa bật công cụ đọc USB");
        return input.toUpperCase(Locale.ROOT);
    }
    private JsonNode run(String resource,List<String> arguments,String stdin,int timeoutSeconds){
        if(!connection.tryAcquire())throw new BusinessException(CONFLICT,"Cổng USB đang có thao tác khác; thử lại sau");
        Path helper=null;Process process=null;
        try{
            helper=Files.createTempFile("smartdoor-usb-",".py");
            try(var source=new ClassPathResource(resource).getInputStream()){Files.copy(source,helper,StandardCopyOption.REPLACE_EXISTING);}
            var command=new ArrayList<>(List.of(python,helper.toString()));command.addAll(arguments);
            process=new ProcessBuilder(command).redirectErrorStream(true).start();
            try(var input=process.getOutputStream()){
                if(stdin!=null){input.write((stdin+"\n").getBytes(StandardCharsets.UTF_8));input.flush();}
            }
            Process child=process;FutureTask<byte[]> output=new FutureTask<>(()->child.getInputStream().readNBytes(16385));
            Thread reader=new Thread(output,"usb-result-reader");reader.setDaemon(true);reader.start();
            if(!process.waitFor(timeoutSeconds,TimeUnit.SECONDS))throw new BusinessException(GATEWAY_TIMEOUT,"ESP32 chưa phản hồi. Đóng Serial Monitor và kiểm tra dây USB");
            byte[] bytes=output.get(2,TimeUnit.SECONDS);
            if(bytes.length>16384)throw new BusinessException(BAD_GATEWAY,"Phản hồi USB không hợp lệ");
            JsonNode result=json.readTree(bytes);
            if(process.exitValue()!=0 || result==null || result.has("error")){
                String code=result==null?"":result.path("error").asText();
                throw new BusinessException(CONFLICT,message(code));
            }
            return result;
        }catch(BusinessException e){throw e;}
        catch(InterruptedException e){Thread.currentThread().interrupt();throw new BusinessException(SERVICE_UNAVAILABLE,"Thao tác USB bị gián đoạn");}
        catch(Exception e){throw new BusinessException(SERVICE_UNAVAILABLE,"Không chạy được công cụ USB. Kiểm tra Python, pyserial và esptool trên máy backend");}
        finally{
            if(process!=null && process.isAlive()){process.descendants().forEach(ProcessHandle::destroyForcibly);process.destroyForcibly();}
            if(helper!=null)try{Files.deleteIfExists(helper);}catch(Exception ignored){}
            connection.release();
        }
    }
    static String message(String code){
        return switch(code){
            case "PORT_NOT_FOUND" -> "Cổng đã ngắt kết nối; bấm tìm cổng USB lại";
            case "TIMEOUT" -> "ESP32 chưa phản hồi. Giữ BOOT và thử lại nếu cần";
            case "TOOL_UNAVAILABLE" -> "Backend chưa cấu hình Python/esptool để thao tác USB";
            case "FLASH_FAILED" -> "Ghi firmware thất bại. Kiểm tra dây USB, giữ BOOT rồi thử lại";
            case "REJECTED" -> "Chip từ chối gói cấp phát (sai MAC hoặc chip đã có danh tính)";
            case "STORAGE_FAILED" -> "Chip không lưu được gói cấp phát vào bộ nhớ";
            case "NO_BOOT" -> "Chip không khởi động sau khi ghi firmware (không trả lời INFO). Kiểm tra factory image rồi nạp lại";
            case "NO_ACK" -> "Chip không xác nhận gói cấp phát; kiểm tra firmware vừa ghi";
            case "INFO_MISMATCH" -> "Chip khởi động lại với danh tính khác gói vừa nạp";
            default -> "Không thao tác được ESP32. Đóng Serial Monitor, kiểm tra cổng và dây USB rồi thử lại";
        };
    }
}
