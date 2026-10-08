package com.smartaccess.controller;

import com.smartaccess.dto.manager.*;
import com.smartaccess.exception.BusinessException;
import com.smartaccess.exception.GlobalExceptionHandler;
import com.smartaccess.model.enumtype.*;
import com.smartaccess.service.ManagerService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import java.util.List;
import java.util.Map;
import com.fasterxml.jackson.databind.ObjectMapper;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(ManagerController.class)
@Import(GlobalExceptionHandler.class)
class ManagerControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean ManagerService service;

    @Test void searchWorksWithoutLoginAndDoesNotExposeSecrets() throws Exception {
        when(service.searchUsers(1L, "2", "account")).thenReturn(List.of(
                new UserSearchResponse(2L, "2", "user@example.test", "User", AccountStatus.ACTIVE)));
        mvc.perform(get("/api/manager/users/search").param("managerId", "1").param("keyword", "2").param("type", "account"))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].id").value(2))
                .andExpect(jsonPath("$[0].passwordHash").doesNotExist()).andExpect(jsonPath("$[0].admin").doesNotExist());
    }

    @Test void missingManagerIdIs400() throws Exception {
        mvc.perform(get("/api/manager/units/10/users")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400));
        verifyNoInteractions(service);
    }

    @Test void malformedUnitIdIs400() throws Exception {
        mvc.perform(get("/api/manager/units/bad/users").param("managerId", "1"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.status").value(400));
    }

    @Test void forbiddenIsConsistent() throws Exception {
        when(service.getUsers(1L, 10L)).thenThrow(new BusinessException(HttpStatus.FORBIDDEN, "Manager does not manage this access unit"));
        mvc.perform(get("/api/manager/units/10/users").param("managerId", "1"))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.status").value(403))
                .andExpect(jsonPath("$.message").value("Manager does not manage this access unit"));
    }

    @Test void registersDeviceWithoutCsrfOrLoginAndReturnsSafeDto() throws Exception {
        when(service.registerDevice(eq(1L), eq(10L), any())).thenReturn(new DeviceResponse(
                30L, "SD-001-ABC", "Door", 10L, DeviceType.DOOR_CONTROLLER, DeviceLifecycleStatus.REGISTERED));
        mvc.perform(post("/api/manager/units/10/devices").param("managerId", "1")
                .contentType(MediaType.APPLICATION_JSON).content(new ObjectMapper().writeValueAsString(Map.of("deviceCode", "SD-001-ABC"))))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.unitId").value(10))
                .andExpect(jsonPath("$.deviceSecretHash").doesNotExist()).andExpect(jsonPath("$.bootstrapSecretHash").doesNotExist());
    }

    @Test void blankDeviceCodeIs400() throws Exception {
        mvc.perform(post("/api/manager/units/10/devices").param("managerId", "1")
                .contentType(MediaType.APPLICATION_JSON).content(new ObjectMapper().writeValueAsString(Map.of("deviceCode", " "))))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.status").value(400));
        verifyNoInteractions(service);
    }

    @Test void malformedJsonIs400() throws Exception {
        mvc.perform(post("/api/manager/units/10/devices").param("managerId", "1")
                .contentType(MediaType.APPLICATION_JSON).content("{"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.status").value(400));
    }

    @Test void partialPermissionPatchPreservesNullAndFalse() throws Exception {
        mvc.perform(patch("/api/manager/units/10/users/2/permissions").param("managerId", "1")
                .contentType(MediaType.APPLICATION_JSON).content(new ObjectMapper().writeValueAsString(Map.of("allowFace", false))))
                .andExpect(status().isOk());
        verify(service).updatePermissions(1L, 10L, 2L, new PermissionRequest(false, null, null, null));
    }

    @Test void removeReturns204() throws Exception {
        mvc.perform(delete("/api/manager/units/10/users/2").param("managerId", "1"))
                .andExpect(status().isNoContent());
        verify(service).removeUser(1L, 10L, 2L);
    }

    @Test void integrityErrorDoesNotLeakSql() throws Exception {
        doThrow(new org.springframework.dao.DataIntegrityViolationException("secret SQL"))
                .when(service).removeUser(1L, 10L, 2L);
        mvc.perform(delete("/api/manager/units/10/users/2").param("managerId", "1"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.status").value(409))
                .andExpect(jsonPath("$.message").value("Operation conflicts with existing data; refresh and retry"));
    }
}
