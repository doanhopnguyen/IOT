package com.smartaccess.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartaccess.exception.GlobalExceptionHandler.ErrorResponse;
import com.smartaccess.repository.AccountRepository;
import com.smartaccess.security.ActiveAccountFilter;
import jakarta.servlet.DispatcherType;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.session.SessionRegistry;
import org.springframework.security.core.session.SessionRegistryImpl;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.context.SecurityContextHolderFilter;
import org.springframework.security.web.authentication.session.*;
import org.springframework.security.web.csrf.CsrfAuthenticationStrategy;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.security.web.csrf.HttpSessionCsrfTokenRepository;
import org.springframework.security.web.session.HttpSessionEventPublisher;
import org.springframework.web.cors.CorsConfiguration;
import java.util.Arrays;
import java.util.List;

@Configuration
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public class SecurityConfig {
    @Bean public SessionRegistry sessionRegistry() { return new SessionRegistryImpl(); }
    @Bean public HttpSessionEventPublisher sessionEvents() { return new HttpSessionEventPublisher(); }
    @Bean public SecurityContextRepository securityContexts() { return new HttpSessionSecurityContextRepository(); }
    @Bean public CsrfTokenRepository csrfTokens() { return new HttpSessionCsrfTokenRepository(); }

    @Bean
    public SessionAuthenticationStrategy sessionAuthenticationStrategy(SessionRegistry sessions, CsrfTokenRepository csrf) {
        return new CompositeSessionAuthenticationStrategy(List.of(
                new ChangeSessionIdAuthenticationStrategy(), new CsrfAuthenticationStrategy(csrf),
                new RegisterSessionAuthenticationStrategy(sessions)));
    }

    @Bean
    public SecurityFilterChain security(HttpSecurity http, AccountRepository accounts, SessionRegistry sessions,
            SecurityContextRepository contexts, CsrfTokenRepository csrf, ObjectMapper json,
            @Value("${app.cors.allowed-origins}") String origins) throws Exception {
        http.securityContext(context -> context.securityContextRepository(contexts))
                .csrf(config -> config.csrfTokenRepository(csrf))
                .cors(config -> config.configurationSource(request -> {
                    CorsConfiguration cors = new CorsConfiguration();
                    cors.setAllowedOrigins(Arrays.stream(origins.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList());
                    cors.setAllowedMethods(List.of("GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"));
                    cors.setAllowedHeaders(List.of("Content-Type", "X-CSRF-TOKEN"));
                    cors.setAllowCredentials(true);
                    return cors;
                }))
                .authorizeHttpRequests(authorize -> authorize
                        .dispatcherTypeMatchers(DispatcherType.ERROR).permitAll()
                        .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/auth/csrf").permitAll()
                        .requestMatchers(org.springframework.http.HttpMethod.POST, "/api/auth/register", "/api/auth/login").permitAll()
                        .requestMatchers("/api/admin/**").hasRole("ADMIN")
                        .anyRequest().authenticated())
                .exceptionHandling(errors -> errors
                        .authenticationEntryPoint((request, response, exception) -> {
                            response.setStatus(401); response.setContentType("application/json");
                            json.writeValue(response.getOutputStream(), new ErrorResponse(401, "Authentication required"));
                        })
                        .accessDeniedHandler((request, response, exception) -> {
                            response.setStatus(403); response.setContentType("application/json");
                            json.writeValue(response.getOutputStream(), new ErrorResponse(403, "Access denied or invalid CSRF token"));
                        }))
                .requestCache(cache -> cache.disable())
                .formLogin(form -> form.disable()).httpBasic(basic -> basic.disable()).logout(logout -> logout.disable())
                .addFilterAfter(new ActiveAccountFilter(accounts, sessions, json), SecurityContextHolderFilter.class);
        return http.build();
    }
}
