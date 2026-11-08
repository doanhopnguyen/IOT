package com.smartaccess.controller;

import com.smartaccess.config.SecurityConfig;
import com.smartaccess.dto.manager.CommandResponse;
import com.smartaccess.exception.GlobalExceptionHandler;
import com.smartaccess.model.Account;
import com.smartaccess.model.enumtype.CommandStatus;
import com.smartaccess.repository.AccountRepository;
import com.smartaccess.security.AccountPrincipal;
import com.smartaccess.service.OnboardingService;
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

@WebMvcTest(OnboardingController.class)
@Import({GlobalExceptionHandler.class,SecurityConfig.class})
class OnboardingControllerTest {
    @Autowired MockMvc mvc;
    @Autowired SessionRegistry sessions;
    @MockitoBean OnboardingService service;
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
    @Test void previewUsesSessionOwnerAndKeepsNegativeOpeningAndDirection() throws Exception {
        when(service.previewServo(1L,7L,"OPEN",-15,180,-1)).thenReturn(new CommandResponse("jog",CommandStatus.SENT,null));
        mvc.perform(post("/api/manager/units/7/servo/preview").session(session).with(csrf())
                .contentType("application/json").content("{\"target\":\"OPEN\",\"angle\":-15,\"servoRange\":180,\"openDirection\":-1,\"actor\":999}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("SENT"));
        verify(service).previewServo(1L,7L,"OPEN",-15,180,-1);
    }
    @Test void fractionalAndStringAnglesAreRejectedWithoutTruncationOrCommands() throws Exception {
        for(String angle:java.util.List.of("90.9","\"90\"","9999999999999")){
            mvc.perform(post("/api/manager/units/7/servo/preview").session(session).with(csrf())
                    .contentType("application/json").content("{\"target\":\"LOCK\",\"angle\":"+angle+",\"servoRange\":180}"))
                    .andExpect(status().isBadRequest());
        }
        verifyNoInteractions(service);
    }
    @Test void motionAndStopRequireCsrf() throws Exception {
        for(String path:java.util.List.of("/servo/preview","/servo/preview/stop")){
            mvc.perform(post("/api/manager/units/7"+path).session(session).contentType("application/json")
                    .content("{\"target\":\"LOCK\",\"angle\":90}"))
                    .andExpect(status().isForbidden());
        }
        verifyNoInteractions(service);
    }
}
