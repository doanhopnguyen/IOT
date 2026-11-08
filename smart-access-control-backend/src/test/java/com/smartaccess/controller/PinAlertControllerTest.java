package com.smartaccess.controller;

import com.smartaccess.config.SecurityConfig;
import com.smartaccess.dto.manager.CommandResponse;
import com.smartaccess.exception.GlobalExceptionHandler;
import com.smartaccess.model.Account;
import com.smartaccess.model.enumtype.CommandStatus;
import com.smartaccess.repository.AccountRepository;
import com.smartaccess.security.AccountPrincipal;
import com.smartaccess.service.PinAlertResponseService;
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
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(PinAlertController.class)
@Import({GlobalExceptionHandler.class,SecurityConfig.class})
class PinAlertControllerTest {
    @Autowired MockMvc mvc;
    @Autowired SessionRegistry sessions;
    @MockitoBean PinAlertResponseService service;
    @MockitoBean AccountRepository accounts;
    MockHttpSession session;
    @BeforeEach void login(){
        Account owner=new Account();owner.setAccountId(1L);
        when(accounts.findById(1L)).thenReturn(java.util.Optional.of(owner));
        session=new MockHttpSession();var principal=new AccountPrincipal(1L);
        var context=SecurityContextHolder.createEmptyContext();
        context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(principal,null,AuthorityUtils.createAuthorityList("ROLE_USER")));
        session.setAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY,context);
        sessions.registerNewSession(session.getId(),principal);
    }
    @Test void acceptsBothChoicesWithSessionAndCsrf() throws Exception {
        for(var action:PinAlertResponseService.Action.values()){
            when(service.respond(7L,action)).thenReturn(new CommandResponse("response",CommandStatus.PENDING,null));
            mvc.perform(post("/api/alerts/7/pin-response").session(session).with(csrf()).contentType("application/json")
                    .content("{\"action\":\""+action+"\"}"))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PENDING"));
            verify(service).respond(7L,action);
        }
    }
    @Test void csrfAndValidChoiceAreRequired() throws Exception {
        mvc.perform(post("/api/alerts/7/pin-response").session(session).contentType("application/json").content("{\"action\":\"SAFE\"}"))
                .andExpect(status().isForbidden());
        for(String body:java.util.List.of("{}","{\"action\":\"IGNORE\"}"))
            mvc.perform(post("/api/alerts/7/pin-response").session(session).with(csrf()).contentType("application/json").content(body))
                    .andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }
}
