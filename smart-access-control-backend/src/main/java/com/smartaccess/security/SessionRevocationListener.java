package com.smartaccess.security;

import com.smartaccess.service.AccountService.SessionsRevoked;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.security.core.session.SessionRegistry;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public class SessionRevocationListener {
    private final SessionRegistry sessions;

    public SessionRevocationListener(SessionRegistry sessions) { this.sessions = sessions; }

    /** Runs after commit so a failed database update never logs the user out. */
    @TransactionalEventListener(fallbackExecution = true)
    public void revoke(SessionsRevoked event) {
        sessions.getAllSessions(new AccountPrincipal(event.accountId()), false).forEach(session -> session.expireNow());
    }
}
