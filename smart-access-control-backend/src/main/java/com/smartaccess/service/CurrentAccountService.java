package com.smartaccess.service;

import com.smartaccess.model.Account;
import com.smartaccess.model.enumtype.AccountStatus;
import com.smartaccess.repository.AccountRepository;
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
    // Integration contract: authentication must expose the account email as principal name.
    // TODO auth owner: adapt this resolver if the future JWT principal uses accountId instead.
    public Account requireAccount() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || auth instanceof AnonymousAuthenticationToken)
            throw new ResponseStatusException(UNAUTHORIZED, "Account authentication required");
        return accounts.findByEmail(auth.getName()).filter(a -> a.getStatus() == AccountStatus.ACTIVE)
            .orElseThrow(() -> new ResponseStatusException(UNAUTHORIZED, "Authenticated account is unavailable"));
    }
}
