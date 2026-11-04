package com.smartaccess.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartaccess.dto.FaceDtos.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.Set;
import static org.springframework.http.HttpStatus.*;

/** Media stays on the server. Only a validated processor vector reaches enrollment storage. */
@Service
public class FaceMediaService {
    private final CurrentAccountService current;
    private final FaceEnrollmentService enrollment;
    private final ObjectMapper json;
    private final String url, token;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3))
            .followRedirects(HttpClient.Redirect.NEVER).build();
    public FaceMediaService(CurrentAccountService current, FaceEnrollmentService enrollment, ObjectMapper json,
            @Value("${app.face-processor.url:http://127.0.0.1:8091/extract}") String url,
            @Value("${app.face-processor.token:}") String token) {
        this.current=current; this.enrollment=enrollment; this.json=json; this.url=url; this.token=token;
    }
    public Profile register(MultipartFile file, boolean consent) {
        current.requireAccount();
        if (!consent) throw new ResponseStatusException(BAD_REQUEST,"Cần đồng ý tải ảnh/video lên máy chủ để đăng ký khuôn mặt.");
        String type=file.getContentType();
        if (type==null || !Set.of("image/jpeg","image/png","video/mp4","video/quicktime","video/webm").contains(type))
            throw new ResponseStatusException(UNSUPPORTED_MEDIA_TYPE,"Chỉ nhận ảnh JPEG/PNG hoặc video MP4/MOV/WebM.");
        long limit=type.startsWith("image/")?5L*1024*1024:20L*1024*1024;
        if (file.isEmpty() || file.getSize()>limit) throw new ResponseStatusException(PAYLOAD_TOO_LARGE,"Ảnh tối đa 5 MiB, video tối đa 20 MiB.");
        if (token.length()<32) throw new ResponseStatusException(SERVICE_UNAVAILABLE,"Dịch vụ xử lý khuôn mặt chưa được cấu hình.");
        try {
            var request=HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(55))
                .header("Authorization","Bearer "+token).header("Content-Type",type)
                .POST(HttpRequest.BodyPublishers.ofByteArray(file.getBytes())).build();
            var response=http.send(request,HttpResponse.BodyHandlers.ofString());
            if (response.statusCode()!=200) {
                var status = response.statusCode()==422 ? UNPROCESSABLE_ENTITY : SERVICE_UNAVAILABLE;
                throw new ResponseStatusException(status,response.statusCode()==422
                    ? "Ảnh/video chưa hợp lệ. Cần đúng một khuôn mặt rõ nét; video tối đa 10 giây và cùng một người."
                    : "Dịch vụ khuôn mặt đang bận hoặc chưa sẵn sàng. Thử lại sau.");
            }
            ProfileInput input=json.readValue(response.body(),ProfileInput.class);
            // Consent is established by this authenticated upload, not by the processor response.
            return enrollment.registerProfile(new ProfileInput(true,input.model(),input.embedding()));
        } catch (ResponseStatusException e) { throw e;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt(); throw new ResponseStatusException(SERVICE_UNAVAILABLE,"Xử lý khuôn mặt bị gián đoạn.");
        } catch (Exception e) { throw new ResponseStatusException(SERVICE_UNAVAILABLE,"Không kết nối được dịch vụ xử lý khuôn mặt."); }
    }
}
