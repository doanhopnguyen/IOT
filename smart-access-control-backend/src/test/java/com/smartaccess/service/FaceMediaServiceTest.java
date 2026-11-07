package com.smartaccess.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartaccess.dto.FaceDtos.Profile;
import com.smartaccess.dto.FaceDtos.ProfileInput;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.server.ResponseStatusException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Map;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class FaceMediaServiceTest {
    private final CurrentAccountService current = mock(CurrentAccountService.class);
    private final FaceEnrollmentService enrollment = mock(FaceEnrollmentService.class);
    private final ObjectMapper json = new ObjectMapper();
    private HttpServer processor;
    private FaceMediaService service;
    private int responseStatus;
    private String responseBody;
    private int calls;
    private final MockMultipartFile photo = new MockMultipartFile("file", "photo.jpg", "image/jpeg", new byte[]{1,2,3});

    @BeforeEach void startProcessor() throws Exception {
        processor = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        processor.createContext("/extract", exchange -> {
            calls++;
            assertThat(exchange.getRequestHeaders().getFirst("Content-Type")).isEqualTo("image/jpeg");
            assertThat(exchange.getRequestHeaders().getFirst("Authorization")).isEqualTo("Bearer " + "t".repeat(32));
            assertThat(exchange.getRequestBody().readAllBytes()).containsExactly(1,2,3);
            byte[] body = responseBody.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(responseStatus, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        processor.start();
        service = new FaceMediaService(current, enrollment, json,
                "http://127.0.0.1:" + processor.getAddress().getPort() + "/extract", "t".repeat(32));
    }

    @AfterEach void stopProcessor() { processor.stop(0); }

    @Test void validProcessorEmbeddingRegistersWithAuthenticatedConsent() throws Exception {
        responseStatus=200;
        var vector=new ArrayList<>(Collections.nCopies(512,0f)); vector.set(0,1f);
        responseBody=json.writeValueAsString(Map.of("model",FaceEmbedding.MODEL,"embedding",vector));
        Profile expected = new Profile(true, 1L, FaceEmbedding.MODEL);
        when(enrollment.registerProfile(any())).thenReturn(expected);
        assertThat(service.register(photo,true)).isEqualTo(expected);
        verify(current).requireAccount();
        verify(enrollment).registerProfile(argThat((ProfileInput input) -> input.consent()
            && input.model().equals(FaceEmbedding.MODEL) && input.embedding().size()==512));
    }

    @Test void knownQualityFailuresReachMobileWithSpecificInstructions() throws Exception {
        responseStatus=422;
        for(var entry:Map.of("NO_FACE","Không tìm thấy khuôn mặt", "FACE_BLURRY","bị mờ",
                "FACE_TOO_SMALL","quá nhỏ", "MULTIPLE_FACES","nhiều khuôn mặt",
                "IMAGE_DIMENSIONS","20 megapixel").entrySet()) {
            responseBody=json.writeValueAsString(Map.of("code",entry.getKey(),"message","untrusted processor text"));
            assertThatThrownBy(() -> service.register(photo,true)).isInstanceOfSatisfying(ResponseStatusException.class,e -> {
                assertThat(e.getStatusCode().value()).isEqualTo(422);
                assertThat(e.getReason()).contains(entry.getValue()).doesNotContain("untrusted");
            });
        }
        verifyNoInteractions(enrollment);
    }

    @Test void unknownAndMalformedProcessorErrorsKeepSafeFallback() {
        responseStatus=422;
        for(String body:new String[]{"{\"message\":\"private path secret\",\"code\":\"NOT_ALLOWED\"}","not json","null"}) {
            responseBody=body;
            assertThatThrownBy(() -> service.register(photo,true)).isInstanceOfSatisfying(ResponseStatusException.class,e -> {
                assertThat(e.getStatusCode().value()).isEqualTo(422);
                assertThat(e.getReason()).contains("Ảnh/video chưa hợp lệ").doesNotContain("private","secret","NOT_ALLOWED");
            });
        }
        verifyNoInteractions(enrollment);
    }

    @Test void processorOutageIsDistinctFromInvalidPhoto() {
        responseStatus=503;responseBody="{}";
        assertThatThrownBy(() -> service.register(photo,true)).isInstanceOfSatisfying(ResponseStatusException.class,
            e -> assertThat(e.getStatusCode().value()).isEqualTo(503));
        verifyNoInteractions(enrollment);
    }

    @Test void missingConsentDoesNotSendBiometricMedia() {
        assertThatThrownBy(() -> service.register(photo,false)).isInstanceOf(ResponseStatusException.class);
        assertThat(calls).isZero();
        verifyNoInteractions(enrollment);
    }
}
