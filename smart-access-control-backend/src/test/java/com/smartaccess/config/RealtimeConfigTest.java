package com.smartaccess.config;

import com.smartaccess.model.Account;
import com.smartaccess.repository.AccountRepository;
import com.smartaccess.security.AccountPrincipal;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.session.SessionRegistryImpl;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.web.socket.*;
import java.util.*;
import static org.mockito.Mockito.*;

class RealtimeConfigTest {
    @Test void loggedOutOrRevokedSessionsAreClosedWithoutData() throws Exception {
        var accounts = mock(AccountRepository.class);
        var registry = new SessionRegistryImpl();
        var config = new RealtimeConfig(accounts, registry, "http://localhost:8081");
        var socket = mock(WebSocketSession.class);
        var http = new MockHttpSession();
        var principal = new AccountPrincipal(1L);
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(new UsernamePasswordAuthenticationToken(principal, null, List.of()));
        http.setAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY, context);
        registry.registerNewSession(http.getId(), principal);
        var account = new Account(); account.setAccountId(1L);
        when(accounts.findById(1L)).thenReturn(Optional.of(account));
        Map<String, Object> attrs = new HashMap<>(); attrs.put("httpSession", http); attrs.put("revision", -1L);
        when(socket.getAttributes()).thenReturn(attrs); when(socket.getId()).thenReturn("s1");
        // Register a socket directly; handshake itself is protected by Spring Security and Origin validation.
        var field = RealtimeConfig.class.getDeclaredField("sessions"); field.setAccessible(true);
        @SuppressWarnings("unchecked") var sockets = (Map<String, WebSocketSession>)field.get(config);
        sockets.put("s1", socket);
        config.push();
        verify(socket).sendMessage(argThat(message -> "{\"type\":\"refresh\"}".equals(message.getPayload())));
        registry.getSessionInformation(http.getId()).expireNow();
        config.push();
        verify(socket).close(CloseStatus.POLICY_VIOLATION);
        verify(socket, times(1)).sendMessage(any());
    }
}
