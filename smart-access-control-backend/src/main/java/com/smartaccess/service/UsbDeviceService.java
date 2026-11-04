package com.smartaccess.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartaccess.exception.BusinessException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import static org.springframework.http.HttpStatus.*;

/** Reads USB attached to the backend host. No flashing, erase or arbitrary shell commands. */
@Service
public class UsbDeviceService {
    public record Port(String device,String description){}
    public record Mac(String port,String factoryMac,String chip){}
    public record Available(boolean enabled,List<Port> ports){}
    private final ObjectMapper json;private final boolean enabled;private final String python,esptool;
    private final Semaphore connection=new Semaphore(1);
    public UsbDeviceService(ObjectMapper json,@Value("${app.usb.enabled:false}") boolean enabled,
            @Value("${app.usb.python-executable:python}") String python,@Value("${app.usb.esptool-script:}") String esptool){
        this.json=json;this.enabled=enabled;this.python=python;this.esptool=esptool;
    }
    public Available list(){
        if(!enabled)return new Available(false,List.of());
        JsonNode result=run(List.of("--list"));List<Port> ports=new ArrayList<>();
        for(JsonNode port:result.path("ports"))ports.add(new Port(port.path("device").asText(),port.path("description").asText()));
        return new Available(true,ports);
    }
    public Mac read(String input){
        if(input==null || !input.matches("(?i)COM[1-9][0-9]{0,3}"))throw new BusinessException(BAD_REQUEST,"Cổng USB không hợp lệ");
        if(!enabled)throw new BusinessException(SERVICE_UNAVAILABLE,"Backend chưa bật công cụ đọc USB");
        JsonNode result=run(List.of("--port",input.toUpperCase(Locale.ROOT),"--esptool",esptool));
        String mac=result.path("factoryMac").asText();
        if(!mac.matches("[0-9A-F]{2}(:[0-9A-F]{2}){5}"))throw new BusinessException(BAD_GATEWAY,"Không xác minh được MAC của chip");
        return new Mac(result.path("port").asText(),mac,result.path("chip").asText());
    }
    private JsonNode run(List<String> arguments){
        if(!connection.tryAcquire())throw new BusinessException(CONFLICT,"Cổng USB đang có thao tác khác; thử lại sau");
        Path helper=null;Process process=null;
        try{
            helper=Files.createTempFile("smartdoor-usb-",".py");
            try(var source=new ClassPathResource("usb/read_device_mac.py").getInputStream()){Files.copy(source,helper,StandardCopyOption.REPLACE_EXISTING);}
            var command=new ArrayList<>(List.of(python,helper.toString()));command.addAll(arguments);
            process=new ProcessBuilder(command).redirectErrorStream(true).start();
            Process child=process;FutureTask<byte[]> output=new FutureTask<>(()->child.getInputStream().readNBytes(16385));
            Thread reader=new Thread(output,"usb-result-reader");reader.setDaemon(true);reader.start();
            if(!process.waitFor(18,TimeUnit.SECONDS))throw new BusinessException(GATEWAY_TIMEOUT,"ESP32 chưa phản hồi. Đóng Serial Monitor và kiểm tra dây USB");
            byte[] bytes=output.get(2,TimeUnit.SECONDS);
            if(bytes.length>16384)throw new BusinessException(BAD_GATEWAY,"Phản hồi USB không hợp lệ");
            JsonNode result=json.readTree(bytes);
            if(process.exitValue()!=0 || result==null || result.has("error")){
                String code=result==null?"":result.path("error").asText();
                throw new BusinessException(CONFLICT,switch(code){
                    case "PORT_NOT_FOUND" -> "Cổng đã ngắt kết nối; bấm tìm cổng USB lại";
                    case "TIMEOUT" -> "ESP32 chưa phản hồi. Giữ BOOT và thử đọc lại nếu cần";
                    case "TOOL_UNAVAILABLE" -> "Backend chưa cấu hình Python/esptool để đọc USB";
                    default -> "Không đọc được ESP32. Đóng Serial Monitor, kiểm tra cổng và dây USB rồi thử lại";
                });
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
}
