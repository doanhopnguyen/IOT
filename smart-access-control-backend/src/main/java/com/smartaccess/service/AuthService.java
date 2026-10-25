package com.smartaccess.service;

import com.smartaccess.dto.account.AccountResponse;
import com.smartaccess.dto.account.LoginRequest;
import com.smartaccess.exception.BusinessException;
import com.smartaccess.model.enumtype.AccountStatus;
import com.smartaccess.repository.AccountRepository;
import com.smartaccess.security.AccountPrincipal;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.session.SessionRegistry;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

@Service
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public class AuthService {
    private final AccountRepository accounts;
    private final PasswordEncoder passwords;
    private final SecurityContextRepository contexts;
    private final SessionAuthenticationStrategy strategy;
    private final SessionRegistry sessions;
    private final MemberProfileService memberProfiles;
    private final String dummyHash;

    public AuthService(AccountRepository accounts, PasswordEncoder passwords, SecurityContextRepository contexts,
            SessionAuthenticationStrategy strategy, SessionRegistry sessions, MemberProfileService memberProfiles) {
        this.accounts = accounts; this.passwords = passwords; this.contexts = contexts;
        this.strategy = strategy; this.sessions = sessions; this.memberProfiles = memberProfiles;
        this.dummyHash = passwords.encode(UUID.randomUUID().toString());
    }

    @Transactional
    public AccountResponse login(LoginRequest input, HttpServletRequest request, HttpServletResponse response) {
        var account = (input.identifier().contains("@")
                ? accounts.findByEmailForUpdate(input.identifier()) : accounts.findByPhoneForUpdate(input.identifier())).orElse(null);
        boolean matches = input.password().getBytes(StandardCharsets.UTF_8).length <= 72
                && passwords.matches(input.password(), account == null ? dummyHash : account.getPasswordHash());
        if (!matches || account == null || account.getStatus() != AccountStatus.ACTIVE) {
            throw new BusinessException(HttpStatus.UNAUTHORIZED, "Invalid credentials or account disabled");
        }
        var previous = request.getSession(false);
        if (previous != null) {
            sessions.removeSessionInformation(previous.getId());
            previous.invalidate();
        }
        var authentication = UsernamePasswordAuthenticationToken.authenticated(new AccountPrincipal(account.getAccountId()),
                null, AuthorityUtils.createAuthorityList(account.isAdmin() ? "ROLE_ADMIN" : "ROLE_USER"));
        request.getSession(true);
        strategy.onAuthentication(authentication, request, response);
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        contexts.saveContext(context, request, response);
        memberProfiles.recordLogin(account);
        return AccountResponse.from(account);
    }
}
