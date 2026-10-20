package com.smartaccess.service;

import com.smartaccess.model.Account;
import com.smartaccess.model.enumtype.AccountStatus;
import com.smartaccess.repository.AccountRepository;
import com.smartaccess.security.AccountPrincipal;
import org.springframework.security.core.Authentication;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import static org.springframework.http.HttpStatus.UNAUTHORIZED;

@Service
public class CurrentAccountService {
    private final AccountRepository accounts;
    public CurrentAccountService(AccountRepository accounts) {
        this.accounts = accounts;
    }
    // Session login (AuthService) stores AccountPrincipal(accountId); other principals are resolved by email.
    public Account requireAccount() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || auth instanceof AnonymousAuthenticationToken)
            throw new ResponseStatusException(UNAUTHORIZED, "Account authentication required");
        var account = auth.getPrincipal() instanceof AccountPrincipal principal
            ? accounts.findById(principal.accountId()) : accounts.findByEmail(auth.getName());
        return account.filter(a -> a.getStatus() == AccountStatus.ACTIVE)
            .orElseThrow(() -> new ResponseStatusException(UNAUTHORIZED, "Authenticated account is unavailable"));
    }
}
