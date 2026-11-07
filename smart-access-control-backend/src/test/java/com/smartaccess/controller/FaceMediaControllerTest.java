package com.smartaccess.controller;

import com.smartaccess.dto.FaceDtos.Profile;
import com.smartaccess.exception.GlobalExceptionHandler;
import com.smartaccess.service.FaceEmbedding;
import com.smartaccess.service.FaceMediaService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class FaceMediaControllerTest {
    private final FaceMediaService service=mock(FaceMediaService.class);
    private final MockMultipartFile photo=new MockMultipartFile("file","portrait.jpg","image/jpeg",new byte[]{1,2,3});
    private MockMvc mvc;

    @BeforeEach void setup() {
        mvc=MockMvcBuilders.standaloneSetup(new FaceMediaController(service))
            .setControllerAdvice(new GlobalExceptionHandler()).build();
    }

    @Test void rejectionIncludesUsefulMessageInsteadOfOnlyHttp422() throws Exception {
        when(service.register(any(),eq(true))).thenThrow(new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
            "Không tìm thấy khuôn mặt trong ảnh. Chọn ảnh chính diện, đủ sáng và thấy rõ toàn bộ mặt."));
        mvc.perform(multipart("/api/faces/me/media").file(photo).param("consent","true"))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.status").value(422))
            .andExpect(jsonPath("$.message").value("Không tìm thấy khuôn mặt trong ảnh. Chọn ảnh chính diện, đủ sáng và thấy rõ toàn bộ mặt."));
    }

    @Test void successKeepsProfileContract() throws Exception {
        when(service.register(any(),eq(true))).thenReturn(new Profile(true,1L,FaceEmbedding.MODEL));
        mvc.perform(multipart("/api/faces/me/media").file(photo).param("consent","true"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.hasTemplate").value(true));
    }

    @Test void serviceOutageHasSeparateActionableMessage() throws Exception {
        when(service.register(any(),eq(true))).thenThrow(new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
            "Dịch vụ khuôn mặt đang bận hoặc chưa sẵn sàng. Thử lại sau."));
        mvc.perform(multipart("/api/faces/me/media").file(photo).param("consent","true"))
            .andExpect(status().isServiceUnavailable())
            .andExpect(jsonPath("$.message").value("Dịch vụ khuôn mặt đang bận hoặc chưa sẵn sàng. Thử lại sau."));
    }
}
