package com.smartaccess.controller;

import com.smartaccess.dto.*;
import com.smartaccess.dto.HistoryDtos.*;
import com.smartaccess.model.enumtype.*;
import com.smartaccess.service.*;
import org.junit.jupiter.api.*;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.http.MediaType;
import java.util.List;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ModuleControllerTest {
    AccessLogService logs = mock(AccessLogService.class);
    AlertService alerts = mock(AlertService.class);
    ImageUploadService images = mock(ImageUploadService.class);
    MockMvc mvc;
    @BeforeEach
    void setup() {
        mvc = MockMvcBuilders.standaloneSetup(new AccessLogController(logs), new AlertController(alerts), new ImageUploadController(images))
            .setControllerAdvice(new ModuleExceptionHandler()).build();
    }

    @Test
    void historyBindsFiltersAndReturnsEmptyPage() throws Exception {
        when(logs.list(3L, null, null, AccessMethod.PIN, AccessResult.ERROR, 0, 30)).thenReturn(new PageResponse<>(List.of(), 0, 30, 0, false));
        mvc.perform(get("/api/access-logs").param("accessUnitId", "3").param("method", "PIN").param("result", "ERROR"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.items").isEmpty()).andExpect(jsonPath("$.hasNext").value(false));
        verify(logs).list(3L, null, null, AccessMethod.PIN, AccessResult.ERROR, 0, 30);
        mvc.perform(get("/api/access-logs").param("method", "invalid")).andExpect(status().isBadRequest());
    }

    @Test
    void eventInputValidatesBeforeCallingService() throws Exception {
        mvc.perform(post("/api/alerts").contentType(MediaType.APPLICATION_JSON).content("{\"deviceId\":-1,\"eventUuid\":\"bad\"}"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").exists());
        verifyNoInteractions(alerts);
    }

    @Test
    void multipartBindsFileAndOptionalFaceRequestAndReturnsCreatedDto() throws Exception {
        when(images.upload(any(), eq(12L))).thenReturn(new ImageUploadResponse("image-id", "/api/images/image-id", "image/png", 3, 12L));
        mvc.perform(multipart("/api/images").file(new MockMultipartFile("file", "a.png", "image/png", new byte[]{1, 2, 3})).param("faceRequestId", "12"))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.faceRequestId").value(12)).andExpect(jsonPath("$.url").value("/api/images/image-id"));
        verify(images).upload(any(), eq(12L));
    }
}
