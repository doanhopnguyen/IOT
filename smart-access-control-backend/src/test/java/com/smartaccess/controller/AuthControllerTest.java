package com.smartaccess.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartaccess.config.PasswordConfig;
import com.smartaccess.config.SecurityConfig;
import com.smartaccess.exception.GlobalExceptionHandler;
import com.smartaccess.model.Account;
import com.smartaccess.model.enumtype.AccountStatus;
import com.smartaccess.repository.AccountRepository;
import com.smartaccess.service.AccountService;
import com.smartaccess.service.AuthService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.core.session.SessionRegistry;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import java.util.Map;
import java.util.Optional;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(AuthController.class)
@Import({SecurityConfig.class, PasswordConfig.class, AccountService.class, AuthService.class, GlobalExceptionHandler.class})
class AuthControllerTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired PasswordEncoder passwords;
    @Autowired SessionRegistry sessions;
    @MockitoBean AccountRepository accounts;
    Account user;

    @BeforeEach void setup() {
        user = new Account(); user.setAccountId(2L); user.setFullName("User");
        user.setEmail("user@example.test"); user.setPhone("0912345678");
        user.setPasswordHash(passwords.encode("Password123!"));
        when(accounts.findByEmailForUpdate(anyString())).thenReturn(Optional.empty());
        when(accounts.findByEmailForUpdate("user@example.test")).thenReturn(Optional.of(user));
        when(accounts.findByPhoneForUpdate("0912345678")).thenReturn(Optional.of(user));
        when(accounts.findById(2L)).thenReturn(Optional.of(user));
    }

    @Test void loginByEmailCreatesSessionAndDoesNotExposePassword() throws Exception {
        var result = mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("identifier", "user@example.test", "password", "Password123!"))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.accountId").value(2))
                .andExpect(jsonPath("$.passwordHash").doesNotExist()).andReturn();
        var session = (MockHttpSession) result.getRequest().getSession(false);
        assertThat(session).isNotNull();
        assertThat(sessions.getSessionInformation(session.getId())).isNotNull();
        mvc.perform(get("/api/manager/unknown").session(session)).andExpect(status().isNotFound());
    }

    @Test void loginByPhoneWorks() throws Exception {
        mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("identifier", "0912345678", "password", "Password123!"))))
                .andExpect(status().isOk());
    }

    @Test void wrongPasswordUnknownUserAndDisabledAccountHaveSameError() throws Exception {
        for (var identifier : new String[]{"user@example.test", "absent@example.test"}) {
            mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                    .content(json.writeValueAsString(Map.of("identifier", identifier, "password", "WrongPassword!"))))
                    .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.message").value("Invalid credentials or account disabled"));
        }
        user.setStatus(AccountStatus.DISABLED);
        mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("identifier", "user@example.test", "password", "Password123!"))))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.message").value("Invalid credentials or account disabled"));
    }

    @Test void loginRequiresCsrfAndValidInput() throws Exception {
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());
    }

    @Test void sessionIdChangesAndOldCsrfIsRejectedAfterLogin() throws Exception {
        var initial = mvc.perform(get("/api/auth/csrf")).andExpect(status().isOk()).andReturn();
        var previous = (MockHttpSession) initial.getRequest().getSession(false);
        String oldId = previous.getId();
        String token = json.readTree(initial.getResponse().getContentAsString()).get("token").asText();
        var login = mvc.perform(post("/api/auth/login").session(previous).header("X-CSRF-TOKEN", token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("identifier", "user@example.test", "password", "Password123!"))))
                .andExpect(status().isOk()).andReturn();
        var current = (MockHttpSession) login.getRequest().getSession(false);
        assertThat(current.getId()).isNotEqualTo(oldId);
        assertThat(previous.isInvalid()).isTrue();
        mvc.perform(post("/api/auth/register").session(current).header("X-CSRF-TOKEN", token)
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
    }

    @Test void registrationIgnoresPrivilegedFieldsAndReturnsSafeDto() throws Exception {
        when(accounts.saveAndFlush(any())).thenAnswer(invocation -> {
            Account account = invocation.getArgument(0); account.setAccountId(3L); return account;
        });
        mvc.perform(post("/api/auth/register").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"fullName\":\"New User\",\"email\":\"new@example.test\",\"password\":\"Password123!\",\"admin\":true,\"status\":\"DISABLED\",\"passwordHash\":\"evil\"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.admin").value(false))
                .andExpect(jsonPath("$.status").value("ACTIVE")).andExpect(jsonPath("$.passwordHash").doesNotExist());
    }

    @Test void corsAllowsConfiguredFrontendAndRejectsOtherOrigin() throws Exception {
        mvc.perform(options("/api/auth/login").header("Origin", "http://localhost:8081")
                .header("Access-Control-Request-Method", "POST").header("Access-Control-Request-Headers", "Content-Type,X-CSRF-TOKEN"))
                .andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Credentials", "true"));
        mvc.perform(options("/api/auth/login").header("Origin", "https://untrusted.example")
                .header("Access-Control-Request-Method", "POST")).andExpect(status().isForbidden());
    }
}
