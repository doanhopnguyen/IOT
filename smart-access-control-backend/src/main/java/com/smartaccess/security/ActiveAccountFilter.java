package com.smartaccess.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartaccess.exception.GlobalExceptionHandler.ErrorResponse;
import com.smartaccess.model.enumtype.AccountStatus;
import com.smartaccess.repository.AccountRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.session.SessionRegistry;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;

public class ActiveAccountFilter extends OncePerRequestFilter {
    private final AccountRepository accounts;
    private final SessionRegistry sessions;
    private final ObjectMapper json;

    public ActiveAccountFilter(AccountRepository accounts, SessionRegistry sessions, ObjectMapper json) {
        this.accounts = accounts;
        this.sessions = sessions;
        this.json = json;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.isAuthenticated()) {
            var session = request.getSession(false);
            var information = session == null ? null : sessions.getSessionInformation(session.getId());
            var principal = authentication.getPrincipal() instanceof AccountPrincipal value ? value : null;
            var account = principal == null ? null : accounts.findById(principal.accountId()).orElse(null);
            if (information == null || information.isExpired() || account == null || account.getStatus() != AccountStatus.ACTIVE) {
                if (session != null) {
                    sessions.removeSessionInformation(session.getId());
                    session.invalidate();
                }
                SecurityContextHolder.clearContext();
                response.setStatus(401);
                response.setContentType("application/json");
                json.writeValue(response.getOutputStream(), new ErrorResponse(401, "Session is no longer valid; sign in again"));
                return;
            }
            information.refreshLastRequest();
            var refreshed = UsernamePasswordAuthenticationToken.authenticated(principal, null,
                    AuthorityUtils.createAuthorityList(account.isAdmin() ? "ROLE_ADMIN" : "ROLE_USER"));
            SecurityContextHolder.getContext().setAuthentication(refreshed);
        }
        chain.doFilter(request, response);
    }
}
