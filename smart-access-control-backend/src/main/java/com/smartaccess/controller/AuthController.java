package com.smartaccess.controller;

import com.smartaccess.dto.account.*;
import com.smartaccess.service.AccountService;
import com.smartaccess.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

@RestController
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
@RequestMapping("/api/auth")
public class AuthController {
    private final AccountService accounts;
    private final AuthService auth;

    public AuthController(AccountService accounts, AuthService auth) { this.accounts = accounts; this.auth = auth; }

    @GetMapping("/csrf")
    public CsrfResponse csrf(CsrfToken token) { return new CsrfResponse(token.getHeaderName(), token.getToken()); }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public AccountResponse register(@Valid @RequestBody RegisterRequest input) { return accounts.register(input); }

    @PostMapping("/login")
    public AccountResponse login(@Valid @RequestBody LoginRequest input, HttpServletRequest request, HttpServletResponse response) {
        return auth.login(input, request, response);
    }

    public record CsrfResponse(String headerName, String token) {}
}
