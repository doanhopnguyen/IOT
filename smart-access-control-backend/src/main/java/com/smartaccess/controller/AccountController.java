package com.smartaccess.controller;

import com.smartaccess.dto.account.*;
import com.smartaccess.security.AccountPrincipal;
import com.smartaccess.service.AccountService;
import jakarta.validation.Valid;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
@RequestMapping("/api/accounts/me")
public class AccountController {
    private final AccountService accounts;

    public AccountController(AccountService accounts) { this.accounts = accounts; }

    @GetMapping
    public AccountResponse profile(@AuthenticationPrincipal AccountPrincipal principal) {
        return accounts.getProfile(principal.accountId());
    }

    @PatchMapping
    public AccountResponse update(@AuthenticationPrincipal AccountPrincipal principal, @Valid @RequestBody UpdateProfileRequest input) {
        return accounts.updateProfile(principal.accountId(), input);
    }

    @PutMapping("/password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void changePassword(@AuthenticationPrincipal AccountPrincipal principal, @Valid @RequestBody ChangePasswordRequest input) {
        accounts.changePassword(principal.accountId(), input);
    }
}
