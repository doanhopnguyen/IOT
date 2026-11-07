package com.smartaccess.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartaccess.dto.FaceDtos.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.Base64;
import java.util.Set;
import java.util.Map;
import javax.imageio.ImageIO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import static org.springframework.http.HttpStatus.*;

/** Media stays on the server. Only a validated processor vector reaches enrollment storage. */
@Service
public class FaceMediaService {
    private static final Logger log = LoggerFactory.getLogger(FaceMediaService.class);
    private static final String INVALID_MEDIA = "Ảnh/video chưa hợp lệ. Chọn ảnh rõ mặt chỉ có một người hoặc video tối đa 10 giây.";
    private static final Map<String,String> REJECTIONS = Map.ofEntries(
        Map.entry("MEDIA_INVALID", "Không đọc được ảnh/video. Chọn lại ảnh JPEG/PNG rõ mặt hoặc video tối đa 10 giây."),
        Map.entry("IMAGE_TOO_LARGE", "Ảnh sau xử lý vượt quá 5 MiB. Chọn ảnh nhỏ hơn hoặc chụp ảnh mới."),
        Map.entry("IMAGE_DIMENSIONS", "Ảnh vượt quá 20 megapixel. Giảm kích thước ảnh rồi thử lại."),
        Map.entry("IMAGE_FORMAT", "Không đọc được ảnh. Chọn JPEG/PNG hoặc chụp ảnh mới."),
        Map.entry("NO_FACE", "Không tìm thấy khuôn mặt trong ảnh. Chọn ảnh chính diện, đủ sáng và thấy rõ toàn bộ mặt."),
        Map.entry("MULTIPLE_FACES", "Ảnh có nhiều khuôn mặt. Chọn ảnh chỉ có một người."),
        Map.entry("FACE_OUT_OF_FRAME", "Khuôn mặt bị cắt sát mép ảnh. Chọn ảnh thấy toàn bộ khuôn mặt."),
        Map.entry("FACE_TOO_SMALL", "Khuôn mặt quá nhỏ trong ảnh. Chụp gần hơn để thấy rõ mặt."),
        Map.entry("FACE_BLURRY", "Ảnh khuôn mặt bị mờ. Chọn ảnh rõ nét hơn hoặc chụp lại đủ sáng."),
        Map.entry("VIDEO_INVALID", "Video cần dài tối đa 10 giây, độ phân giải tối đa 4K và có ít nhất 3 khung hình."),
        Map.entry("VIDEO_READ_FAILED", "Không đọc được video. Chọn MP4 hoặc tải ảnh rõ mặt."),
        Map.entry("VIDEO_DIFFERENT_PEOPLE", "Video phải chỉ có cùng một người xuyên suốt.")
    );
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
                if(response.statusCode()==422) {
                    String code="";
                    try { code=json.readTree(response.body()).path("code").asText(""); } catch(Exception ignored) { }
                    log.warn("Face enrollment rejected: {}", REJECTIONS.containsKey(code)?code:"MEDIA_INVALID");
                    throw new ResponseStatusException(UNPROCESSABLE_ENTITY, REJECTIONS.getOrDefault(code,INVALID_MEDIA));
                }
                throw new ResponseStatusException(SERVICE_UNAVAILABLE,"Dịch vụ khuôn mặt đang bận hoặc chưa sẵn sàng. Thử lại sau.");
            }
            ProfileInput input=json.readValue(response.body(),ProfileInput.class);
            String previewImage = buildPreviewDataUri(file.getBytes(), type);
            // Consent is established by this authenticated upload, not by the processor response.
            return enrollment.registerProfile(new ProfileInput(true,input.model(),input.embedding(),previewImage));
        } catch (ResponseStatusException e) { throw e;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt(); throw new ResponseStatusException(SERVICE_UNAVAILABLE,"Xử lý khuôn mặt bị gián đoạn.");
        } catch (Exception e) { throw new ResponseStatusException(SERVICE_UNAVAILABLE,"Không kết nối được dịch vụ xử lý khuôn mặt."); }
    }

    private static String buildPreviewDataUri(byte[] rawBytes, String contentType) {
        if (rawBytes == null || contentType == null || !contentType.startsWith("image/")) return null;
        try {
            BufferedImage src = ImageIO.read(new ByteArrayInputStream(rawBytes));
            if (src == null || src.getWidth() <= 0 || src.getHeight() <= 0) return null;
            int maxEdge = 320;
            int w = src.getWidth();
            int h = src.getHeight();
            if (Math.max(w, h) > maxEdge) {
                if (w >= h) {
                    h = Math.max(1, (int) Math.round((double) h * maxEdge / w));
                    w = maxEdge;
                } else {
                    w = Math.max(1, (int) Math.round((double) w * maxEdge / h));
                    h = maxEdge;
                }
            }
            BufferedImage dst = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
            Graphics2D g = dst.createGraphics();
            try {
                g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
                g.drawImage(src, 0, 0, w, h, null);
            } finally {
                g.dispose();
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            ImageIO.write(dst, "jpg", out);
            return "data:image/jpeg;base64," + Base64.getEncoder().encodeToString(out.toByteArray());
        } catch (Exception ignored) {
            return null;
        }
    }
}
