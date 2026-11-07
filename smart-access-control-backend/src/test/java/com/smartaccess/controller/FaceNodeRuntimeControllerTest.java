package com.smartaccess.controller;

import com.smartaccess.config.FaceNodeSecurityConfig;
import com.smartaccess.exception.GlobalExceptionHandler;
import com.smartaccess.model.*;
import com.smartaccess.model.enumtype.*;
import com.smartaccess.repository.*;
import com.smartaccess.service.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;
import java.time.LocalDateTime;
import java.util.Optional;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(FaceNodeRuntimeController.class)
@Import({FaceNodeSecurityConfig.class,GlobalExceptionHandler.class})
class FaceNodeRuntimeControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean DeviceAuthenticationService authentication;
    @MockitoBean DeviceRepository devices;
    @MockitoBean DeviceInventoryRepository inventory;
    @MockitoBean FaceEnrollmentService enrollment;
    @MockitoBean FaceRecognitionService recognition;
    Device camera,controller;
    DeviceInventory item;
    @BeforeEach void setup(){
        AccessUnit unit=new AccessUnit();unit.setUnitId(7L);unit.setUnitName("Door");
        camera=new Device();camera.setDeviceUid("FACE-laptop");camera.setDeviceType(DeviceType.FACE_CAMERA_NODE);camera.setAccessUnit(unit);
        controller=new Device();controller.setDeviceId(8L);controller.setLifecycleStatus(DeviceLifecycleStatus.ACTIVE);controller.setLastSeenAt(LocalDateTime.now());
        item=new DeviceInventory();item.setSetupReady(false);item.setState("CLAIMED");
        when(authentication.authenticate(any(),any())).thenAnswer(i->{
            if("FACE-laptop".equals(i.getArgument(0)) && "valid-key".equals(i.getArgument(1)))return camera;
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        });
        when(devices.findFirstByAccessUnit_UnitIdAndDeviceType(7L,DeviceType.DOOR_CONTROLLER)).thenReturn(Optional.of(controller));
        when(inventory.findById(8L)).thenReturn(Optional.of(item));
    }
    @Test void cameraCanWaitForReadinessButOnlyAfterFullActivationIsReadyTrue() throws Exception {
        mvc.perform(get("/api/face-node/connection").header("X-Device-Uid","FACE-laptop").header("X-Device-Secret","valid-key"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.doorCode").value("SD-000007"))
                .andExpect(jsonPath("$.ready").value(false)).andExpect(jsonPath("$.doorOnline").value(true))
                .andExpect(jsonPath("$.deviceSecret").doesNotExist());
        item.setState("ACTIVE");item.setSetupReady(true);
        controller.setLastSeenAt(LocalDateTime.now().minusSeconds(100));
        mvc.perform(get("/api/face-node/connection").header("X-Device-Uid","FACE-laptop").header("X-Device-Secret","valid-key"))
                .andExpect(jsonPath("$.ready").value(true)).andExpect(jsonPath("$.doorOnline").value(false));
    }
    @Test void accountCookieMissingSecretWrongSecretAndDoorControllersCannotPublishFaceEvents() throws Exception {
        for(String secret:new String[]{"","wrong-key"}){
            mvc.perform(post("/api/face-node/events").header("X-Device-Uid","FACE-laptop").header("X-Device-Secret",secret)
                    .contentType("application/json").content("{}"))
                    .andExpect(status().isUnauthorized());
        }
        camera.setDeviceType(DeviceType.DOOR_CONTROLLER);
        mvc.perform(post("/api/face-node/events").header("X-Device-Uid","FACE-laptop").header("X-Device-Secret","valid-key")
                .contentType("application/json").content("{}"))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(enrollment,recognition);
    }
    @Test void httpEventsUseAuthenticatedIdentityAndTheSameRecognitionServiceAsMqtt() throws Exception {
        mvc.perform(post("/api/face-node/events").header("X-Device-Uid","FACE-laptop").header("X-Device-Secret","valid-key")
                .contentType("application/json").content("{\"schemaVersion\":1,\"deviceUid\":\"FACE-forged\",\"unitId\":999,\"liveness\":\"LIVE\"}"))
                .andExpect(status().isNoContent());
        verify(enrollment).heartbeat("FACE-laptop","valid-key");
        verify(recognition).receive(eq("FACE-laptop"),argThat(event->event.path("liveness").asText().equals("LIVE")));
    }
    @Test void malformedAndOversizedRuntimeEventsAreRejected() throws Exception {
        for(String body:new String[]{"[]","{\"data\":\""+"x".repeat(4096)+"\"}"}){
            mvc.perform(post("/api/face-node/events").header("X-Device-Uid","FACE-laptop").header("X-Device-Secret","valid-key")
                    .contentType("application/json").content(body)).andExpect(status().isBadRequest());
        }
        verifyNoInteractions(enrollment,recognition);
    }
}
