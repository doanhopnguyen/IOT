package com.smartaccess.config;

import com.smartaccess.repository.AccountRepository;
import com.smartaccess.model.enumtype.AccountStatus;
import com.smartaccess.security.AccountPrincipal;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.event.EventListener;
import org.springframework.http.server.*;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.web.socket.*;
import org.springframework.web.socket.config.annotation.*;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/** Sends invalidations only. Clients fetch data through the existing per-account REST guards. */
@Configuration
@EnableWebSocket
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public class RealtimeConfig implements WebSocketConfigurer {
    public record DeviceUpdated() {}
    private final Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();
    private final AtomicLong revision = new AtomicLong();
    private final AccountRepository accounts;
    private final org.springframework.security.core.session.SessionRegistry registry;
    private final String[] origins;

    public RealtimeConfig(AccountRepository accounts, org.springframework.security.core.session.SessionRegistry registry,
                          @Value("${app.cors.allowed-origins}") String origins) {
        this.accounts = accounts;
        this.registry = registry;
        this.origins = Arrays.stream(origins.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toArray(String[]::new);
    }
    @Override public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(new TextWebSocketHandler() {
            @Override public void afterConnectionEstablished(WebSocketSession session) {
                session.getAttributes().put("revision", -1L); sessions.put(session.getId(), session);
            }
            @Override public void afterConnectionClosed(WebSocketSession session, CloseStatus status) { sessions.remove(session.getId()); }
        }, "/ws/updates").setAllowedOrigins(origins).addInterceptors(new HandshakeInterceptor() {
            @Override public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
                    WebSocketHandler handler, Map<String, Object> attributes) {
                if (!(request instanceof ServletServerHttpRequest servlet) || request.getPrincipal() == null) return false;
                HttpSession http = servlet.getServletRequest().getSession(false);
                if (http == null) return false;
                attributes.put("httpSession", http); return true;
            }
            @Override public void afterHandshake(ServerHttpRequest req, ServerHttpResponse res, WebSocketHandler handler, Exception e) {}
        });
    }
    @EventListener public void changed(DeviceUpdated event) { revision.incrementAndGet(); }

    @Scheduled(fixedDelay = 1000)
    public void push() {
        for (WebSocketSession socket : sessions.values()) {
            try {
                HttpSession http = (HttpSession)socket.getAttributes().get("httpSession");
                var registered = registry.getSessionInformation(http.getId());
                if (registered == null || registered.isExpired()) {
                    socket.close(CloseStatus.POLICY_VIOLATION); sessions.remove(socket.getId()); continue;
                }
                Object context = http.getAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY);
                if (!(context instanceof SecurityContext security) || security.getAuthentication() == null
                        || !(security.getAuthentication().getPrincipal() instanceof AccountPrincipal principal)) {
                    socket.close(CloseStatus.POLICY_VIOLATION); sessions.remove(socket.getId()); continue;
                }
                long current = revision.get();
                if (!Objects.equals(socket.getAttributes().get("revision"), current)) {
                    // Khóa tài khoản / đổi mật khẩu đã làm phiên hết hạn (kiểm tra ở trên mỗi giây);
                    // chỉ đọc DB khi thật sự sắp gửi, không phải mỗi giây cho mỗi socket.
                    if (accounts.findById(principal.accountId()).filter(a -> a.getStatus() == AccountStatus.ACTIVE).isEmpty()) {
                        socket.close(CloseStatus.POLICY_VIOLATION); sessions.remove(socket.getId()); continue;
                    }
                    socket.sendMessage(new TextMessage("{\"type\":\"refresh\"}"));
                    socket.getAttributes().put("revision", current);
                }
            } catch (Exception e) {
                sessions.remove(socket.getId());
                try { socket.close(CloseStatus.POLICY_VIOLATION); } catch (Exception ignored) { }
            }
        }
    }
}
