package com.smartaccess.controller;

import com.smartaccess.config.SecurityConfig;
import com.smartaccess.exception.GlobalExceptionHandler;
import com.smartaccess.model.Account;
import com.smartaccess.repository.AccountRepository;
import com.smartaccess.security.AccountPrincipal;
import com.smartaccess.service.StatsService;
import com.smartaccess.service.UnitSettingsService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.session.SessionRegistry;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import java.util.Optional;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(OwnerDashboardController.class)
@Import({GlobalExceptionHandler.class, SecurityConfig.class})
class OwnerDashboardControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean StatsService stats;
    @MockitoBean UnitSettingsService settings;
    @MockitoBean AccountRepository accounts;
    @Autowired SessionRegistry sessions;
    MockHttpSession session;

    @BeforeEach void login() {
        Account manager = new Account(); manager.setAccountId(1L);
        when(accounts.findById(1L)).thenReturn(Optional.of(manager));
        session = new MockHttpSession();
        var principal = new AccountPrincipal(1L);
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(principal, null,
                AuthorityUtils.createAuthorityList("ROLE_USER")));
        session.setAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY, context);
        sessions.registerNewSession(session.getId(), principal);
    }

    @Test void anonymousIs401() throws Exception {
        mvc.perform(get("/api/manager/units/3/stats/access")).andExpect(status().isUnauthorized());
        verifyNoInteractions(stats);
    }

    @Test void csvHasBomHeaderAndContentType() throws Exception {
        when(stats.accessLogCsv(eq(1L), eq(3L), any(), any())).thenReturn("﻿thoi_gian,phuong_thuc,ket_qua,nguoi_dung,ly_do\r\n");
        var result = mvc.perform(get("/api/manager/units/3/access-logs.csv").session(session))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith("text/csv"))
                .andExpect(header().string("Content-Disposition", org.hamcrest.Matchers.containsString("attachment")))
                .andReturn();
        byte[] body = result.getResponse().getContentAsByteArray();
        assertThat(new byte[] {body[0], body[1], body[2]}).containsExactly((byte) 0xEF, (byte) 0xBB, (byte) 0xBF);
    }

    @Test void statsUseAuthenticatedManager() throws Exception {
        mvc.perform(get("/api/manager/units/3/stats/access").session(session).param("days", "7")).andExpect(status().isOk());
        verify(stats).dailyAccess(1L, 3L, 7);
    }
}
