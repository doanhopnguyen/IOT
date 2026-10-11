package com.smartaccess.config;

import com.smartaccess.model.Account;
import com.smartaccess.model.enumtype.AccountStatus;
import com.smartaccess.repository.AccountRepository;
import com.smartaccess.service.CurrentAccountService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import java.util.List;
import static org.springframework.http.HttpStatus.UNAUTHORIZED;

/** Local integration bridge while authentication is unfinished; never active with the prod profile. */
@Configuration
@Profile("demo & !prod")
public class DemoIntegrationConfig {
    @Bean
    @Primary
    CurrentAccountService demoAccount(AccountRepository accounts, @Value("${app.demo-account-id}") Long id) {
        return new CurrentAccountService(accounts) {
            @Override
            public Account requireAccount() {
                return accounts.findById(id).filter(a -> a.getStatus() == AccountStatus.ACTIVE)
                    .orElseThrow(() -> new ResponseStatusException(UNAUTHORIZED, "Configured demo account is unavailable"));
            }
        };
    }

    @Bean
    SecurityFilterChain demoSecurity(HttpSecurity http) throws Exception {
        return http.authorizeHttpRequests(a -> a.requestMatchers("/api/access-logs", "/api/alerts", "/api/alerts/**", "/api/images", "/api/images/**").permitAll().anyRequest().denyAll())
            .csrf(c -> c.ignoringRequestMatchers("/api/alerts", "/api/images"))
            .cors(org.springframework.security.config.Customizer.withDefaults())
            .build();
    }

    @Bean
    CorsConfigurationSource demoCors(@Value("${app.demo-web-origin:}") String origin) {
        var source = new UrlBasedCorsConfigurationSource();
        if (!origin.isBlank()) {
            var cors = new CorsConfiguration();
            cors.setAllowedOrigins(List.of(origin));
            cors.setAllowedMethods(List.of("GET", "POST"));
            cors.setAllowedHeaders(List.of("Accept", "Content-Type", "Authorization"));
            source.registerCorsConfiguration("/api/access-logs", cors);
            source.registerCorsConfiguration("/api/alerts", cors);
            source.registerCorsConfiguration("/api/alerts/**", cors);
            source.registerCorsConfiguration("/api/images", cors);
            source.registerCorsConfiguration("/api/images/**", cors);
        }
        return source;
    }
}
