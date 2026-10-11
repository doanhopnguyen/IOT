package com.smartaccess.controller;

import com.smartaccess.dto.account.AccountResponse;
import com.smartaccess.dto.account.AccountStatusRequest;
import com.smartaccess.security.AccountPrincipal;
import com.smartaccess.service.AccountService;
import jakarta.validation.Valid;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
@RequestMapping("/api/admin/accounts")
public class AdminAccountController {
    private final AccountService accounts;

    public AdminAccountController(AccountService accounts) { this.accounts = accounts; }

    @PatchMapping("/{accountId}/status")
    public AccountResponse status(@AuthenticationPrincipal AccountPrincipal principal, @PathVariable Long accountId,
            @Valid @RequestBody AccountStatusRequest input) {
        return accounts.changeStatus(principal.accountId(), accountId, input.status());
    }
}
