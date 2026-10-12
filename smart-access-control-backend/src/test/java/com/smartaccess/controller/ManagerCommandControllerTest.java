package com.smartaccess.controller;

import com.smartaccess.config.SecurityConfig;
import com.smartaccess.dto.manager.CommandResponse;
import com.smartaccess.exception.BusinessException;
import com.smartaccess.exception.GlobalExceptionHandler;
import com.smartaccess.model.Account;
import com.smartaccess.model.enumtype.CommandStatus;
import com.smartaccess.repository.AccountRepository;
import com.smartaccess.security.AccountPrincipal;
import com.smartaccess.service.DeviceCommandService;
import com.smartaccess.service.FingerprintService;
import com.smartaccess.service.PinService;
import com.smartaccess.service.RemoteUnlockService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.session.SessionRegistry;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(ManagerCommandController.class)
@Import({GlobalExceptionHandler.class, SecurityConfig.class})
class ManagerCommandControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean PinService pinService;
    @MockitoBean FingerprintService fingerprintService;
    @MockitoBean RemoteUnlockService remoteUnlockService;
    @MockitoBean DeviceCommandService commandService;
    @MockitoBean AccountRepository accounts;
    @Autowired SessionRegistry sessions;
    MockHttpSession session;

    CommandResponse pending = new CommandResponse("u-1", CommandStatus.PENDING, null);

    @BeforeEach
    void login() {
        Account manager = new Account();
        manager.setAccountId(1L);
        when(accounts.findById(1L)).thenReturn(java.util.Optional.of(manager));
        session = new MockHttpSession();
        var principal = new AccountPrincipal(1L);
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(principal, null,
                AuthorityUtils.createAuthorityList("ROLE_USER")));
        session.setAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY, context);
        sessions.registerNewSession(session.getId(), principal);
    }

    @Test
    void endpointsReturn202UsingAuthenticatedIdentity() throws Exception {
        when(pinService.changePin(eq(1L), eq(10L), any())).thenReturn(pending);
        when(fingerprintService.startEnroll(eq(1L), eq(10L), eq(3L), any())).thenReturn(pending);
        when(fingerprintService.startDelete(1L, 10L, 3L, 7L)).thenReturn(pending);
        when(remoteUnlockService.unlock(1L, 10L)).thenReturn(pending);
        when(commandService.getOwnCommand(1L, "u-1")).thenReturn(pending);

        mvc.perform(put("/api/manager/units/10/pin").session(session).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"pin\":\"123456\",\"confirmPin\":\"123456\"}"))
                .andExpect(status().isAccepted()).andExpect(jsonPath("$.commandUuid").value("u-1"))
                .andExpect(jsonPath("$.status").value("PENDING"));
        mvc.perform(post("/api/manager/units/10/users/3/fingerprints").session(session).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"label\":\"Ngón trỏ\"}"))
                .andExpect(status().isAccepted());
        mvc.perform(delete("/api/manager/units/10/users/3/fingerprints/7").session(session).with(csrf()))
                .andExpect(status().isAccepted());
        // managerId trên query bị bỏ qua, danh tính lấy từ session
        mvc.perform(post("/api/manager/units/10/unlock").session(session).with(csrf()).param("managerId", "999"))
                .andExpect(status().isAccepted());
        mvc.perform(get("/api/manager/commands/u-1").session(session)).andExpect(status().isOk());
    }

    @Test
    void anonymousRequestIs401() throws Exception {
        mvc.perform(get("/api/manager/commands/u-1")).andExpect(status().isUnauthorized());
        verifyNoInteractions(commandService);
    }

    @Test
    void forbiddenUsesExistingHandler() throws Exception {
        when(remoteUnlockService.unlock(1L, 10L))
                .thenThrow(new BusinessException(HttpStatus.FORBIDDEN, "Bạn không có quyền quản lý cửa này"));
        mvc.perform(post("/api/manager/units/10/unlock").session(session).with(csrf()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("Bạn không có quyền quản lý cửa này"));
    }
}
