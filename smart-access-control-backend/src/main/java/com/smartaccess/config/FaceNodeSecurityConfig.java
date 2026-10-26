package com.smartaccess.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartaccess.model.enumtype.DeviceType;
import com.smartaccess.service.DeviceAuthenticationService;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.context.annotation.*;
import org.springframework.core.annotation.Order;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.server.ResponseStatusException;
import java.io.IOException;
import java.util.List;
import java.util.Map;

@Configuration
@org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication(type = org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication.Type.SERVLET)
public class FaceNodeSecurityConfig {
    @Bean
    @Order(1)
    SecurityFilterChain faceNodeSecurity(HttpSecurity http, DeviceAuthenticationService devices, ObjectMapper json) throws Exception {
        return http.securityMatcher("/api/face-node/**")
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .csrf(c -> c.disable())
                .requestCache(c -> c.disable())
                .authorizeHttpRequests(a -> a.anyRequest().hasRole("FACE_NODE"))
                .exceptionHandling(e -> e.authenticationEntryPoint((req, res, ex) -> error(res, json)))
                .addFilterBefore(new OncePerRequestFilter() {
                    @Override
                    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
                            throws ServletException, IOException {
                        try {
                            var device = devices.authenticate(request.getHeader("X-Device-Uid"), request.getHeader("X-Device-Secret"));
                            if (device.getDeviceType() != DeviceType.FACE_CAMERA_NODE) {
                                error(response, json);
                                return;
                            }
                            SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                                    device.getDeviceUid(), null, List.of(new SimpleGrantedAuthority("ROLE_FACE_NODE"))));
                        } catch (ResponseStatusException exception) {
                            error(response, json);
                            return;
                        }
                        try { chain.doFilter(request, response); }
                        finally { SecurityContextHolder.clearContext(); }
                    }
                }, UsernamePasswordAuthenticationFilter.class).build();
    }

    private static void error(HttpServletResponse response, ObjectMapper json) throws IOException {
        response.setStatus(401);
        response.setContentType("application/json");
        json.writeValue(response.getOutputStream(), Map.of("status", 401, "message", "Node camera không hợp lệ hoặc đã bị vô hiệu hóa."));
    }
}
