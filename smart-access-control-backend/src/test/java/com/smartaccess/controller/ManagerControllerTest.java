package com.smartaccess.controller;

import com.smartaccess.dto.manager.*;
import com.smartaccess.exception.BusinessException;
import com.smartaccess.exception.GlobalExceptionHandler;
import com.smartaccess.model.enumtype.*;
import com.smartaccess.service.ManagerService;
import com.smartaccess.config.SecurityConfig;
import com.smartaccess.model.Account;
import com.smartaccess.repository.AccountRepository;
import com.smartaccess.security.AccountPrincipal;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.session.SessionRegistry;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
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
@Import({GlobalExceptionHandler.class, SecurityConfig.class})
class ManagerControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean ManagerService service;
    @MockitoBean AccountRepository accounts;
    @Autowired SessionRegistry sessions;
    MockHttpSession session;

    @BeforeEach void login() {
        Account manager = new Account(); manager.setAccountId(1L);
        when(accounts.findById(1L)).thenReturn(java.util.Optional.of(manager));
        session = new MockHttpSession();
        var principal = new AccountPrincipal(1L);
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(principal, null, AuthorityUtils.createAuthorityList("ROLE_USER")));
        session.setAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY, context);
        sessions.registerNewSession(session.getId(), principal);
    }

    @Test void searchUsesAuthenticatedIdentityAndDoesNotExposeSecrets() throws Exception {
        when(service.searchUsers(1L, "2", "account")).thenReturn(List.of(
                new UserSearchResponse(2L, "2", "user@example.test", "User", AccountStatus.ACTIVE)));
        mvc.perform(get("/api/manager/users/search").session(session).param("managerId", "999").param("keyword", "2").param("type", "account"))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].id").value(2))
                .andExpect(jsonPath("$[0].passwordHash").doesNotExist()).andExpect(jsonPath("$[0].admin").doesNotExist());
    }

    @Test void anonymousRequestIs401() throws Exception {
        mvc.perform(get("/api/manager/units/10/users")).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401));
        verifyNoInteractions(service);
    }

    @Test void malformedUnitIdIs400() throws Exception {
        mvc.perform(get("/api/manager/units/bad/users").session(session))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.status").value(400));
    }

    @Test void forbiddenIsConsistent() throws Exception {
        when(service.getUsers(1L, 10L)).thenThrow(new BusinessException(HttpStatus.FORBIDDEN, "Manager does not manage this access unit"));
        mvc.perform(get("/api/manager/units/10/users").session(session))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.status").value(403))
                .andExpect(jsonPath("$.message").value("Manager does not manage this access unit"));
    }

    @Test void registersDeviceWithSessionAndCsrfAndReturnsSafeDto() throws Exception {
        when(service.registerDevice(eq(1L), eq(10L), any())).thenReturn(new DeviceResponse(
                30L, "SD-001-ABC", "Door", 10L, DeviceType.DOOR_CONTROLLER, DeviceLifecycleStatus.REGISTERED));
        mvc.perform(post("/api/manager/units/10/devices").session(session).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(new ObjectMapper().writeValueAsString(Map.of("deviceCode", "SD-001-ABC"))))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.unitId").value(10))
                .andExpect(jsonPath("$.deviceSecretHash").doesNotExist()).andExpect(jsonPath("$.bootstrapSecretHash").doesNotExist());
    }

    @Test void blankDeviceCodeIs400() throws Exception {
        mvc.perform(post("/api/manager/units/10/devices").session(session).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(new ObjectMapper().writeValueAsString(Map.of("deviceCode", " "))))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.status").value(400));
        verifyNoInteractions(service);
    }

    @Test void malformedJsonIs400() throws Exception {
        mvc.perform(post("/api/manager/units/10/devices").session(session).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.status").value(400));
    }

    @Test void partialPermissionPatchPreservesNullAndFalse() throws Exception {
        mvc.perform(patch("/api/manager/units/10/users/2/permissions").session(session).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(new ObjectMapper().writeValueAsString(Map.of("allowFace", false))))
                .andExpect(status().isOk());
        verify(service).updatePermissions(1L, 10L, 2L, new PermissionRequest(false, null, null, null));
    }

    @Test void removeReturns204() throws Exception {
        mvc.perform(delete("/api/manager/units/10/users/2").session(session).with(csrf()))
                .andExpect(status().isNoContent());
        verify(service).removeUser(1L, 10L, 2L);
    }

    @Test void integrityErrorDoesNotLeakSql() throws Exception {
        doThrow(new org.springframework.dao.DataIntegrityViolationException("secret SQL"))
                .when(service).removeUser(1L, 10L, 2L);
        mvc.perform(delete("/api/manager/units/10/users/2").session(session).with(csrf()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.status").value(409))
                .andExpect(jsonPath("$.message").value("Operation conflicts with existing data; refresh and retry"));
    }
}
