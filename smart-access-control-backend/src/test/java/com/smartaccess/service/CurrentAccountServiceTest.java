package com.smartaccess.service;

import com.smartaccess.model.Account;
import com.smartaccess.model.enumtype.AccountStatus;
import com.smartaccess.repository.AccountRepository;
import org.junit.jupiter.api.*;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;
import java.util.List;
import java.util.Optional;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class CurrentAccountServiceTest {
    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void failsClosedWithoutRecognizedAuthenticatedAccount() {
        var accounts = mock(AccountRepository.class);
        var service = new CurrentAccountService(accounts);
        assertThatThrownBy(service::requireAccount).isInstanceOf(ResponseStatusException.class);
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("unknown@example.test", "", List.of()));
        assertThatThrownBy(service::requireAccount).isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void acceptsExistingActivePrincipalAndRejectsDisabledAccount() {
        var accounts = mock(AccountRepository.class);
        var service = new CurrentAccountService(accounts);
        Account account = new Account();
        account.setAccountId(7L);
        account.setStatus(AccountStatus.ACTIVE);
        when(accounts.findByEmail("manager@example.test")).thenReturn(Optional.of(account));
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("manager@example.test", "", List.of()));
        assertThat(service.requireAccount()).isSameAs(account);
        account.setStatus(AccountStatus.DISABLED);
        assertThatThrownBy(service::requireAccount).isInstanceOf(ResponseStatusException.class);
    }
}
