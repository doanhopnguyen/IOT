package com.smartaccess.service;

import com.smartaccess.dto.account.RegisterRequest;
import com.smartaccess.exception.BusinessException;
import com.smartaccess.model.Account;
import com.smartaccess.model.enumtype.AccountStatus;
import com.smartaccess.repository.AccountRepository;
import jakarta.validation.Validation;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import java.util.Optional;

@ExtendWith(MockitoExtension.class)
class AccountServiceTest {
    @Mock AccountRepository accounts;
    BCryptPasswordEncoder passwords = new BCryptPasswordEncoder(4);
    AccountService service;

    @BeforeEach void setup() { service = new AccountService(accounts, passwords); }

    @Test void registersEmailWithHashAndSafeDefaults() {
        when(accounts.saveAndFlush(any())).thenAnswer(invocation -> {
            Account account = invocation.getArgument(0);
            account.setAccountId(5L);
            assertThat(passwords.matches("Password123!", account.getPasswordHash())).isTrue();
            assertThat(account.getPasswordHash()).isNotEqualTo("Password123!");
            return account;
        });
        var response = service.register(new RegisterRequest(" Test User ", " USER@EXAMPLE.TEST ", null, "Password123!"));
        assertThat(response.email()).isEqualTo("user@example.test");
        assertThat(response.fullName()).isEqualTo("Test User");
        assertThat(response.admin()).isFalse();
        assertThat(response.status()).isEqualTo(AccountStatus.ACTIVE);
    }

    @Test void registersPhoneWithoutEmail() {
        when(accounts.saveAndFlush(any())).thenAnswer(invocation -> invocation.getArgument(0));
        assertThat(service.register(new RegisterRequest("User", null, "0912345678", "Password123!")).phone())
                .isEqualTo("0912345678");
    }

    @Test void duplicateEmailIsConflict() {
        Account existing = new Account(); existing.setAccountId(1L);
        when(accounts.findByEmailIgnoreCase("user@example.test")).thenReturn(Optional.of(existing));
        assertThatThrownBy(() -> service.register(new RegisterRequest("User", "user@example.test", null, "Password123!")))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getStatus()).isEqualTo(HttpStatus.CONFLICT));
        verify(accounts, never()).saveAndFlush(any());
    }

    @Test void duplicatePhoneIsConflict() {
        Account existing = new Account(); existing.setAccountId(1L);
        when(accounts.findByPhone("0912345678")).thenReturn(Optional.of(existing));
        assertThatThrownBy(() -> service.register(new RegisterRequest("User", null, "0912345678", "Password123!")))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getStatus()).isEqualTo(HttpStatus.CONFLICT));
    }

    @Test void refusesMissingContactAndOversizeUtf8Password() {
        assertThatThrownBy(() -> service.register(new RegisterRequest("User", null, null, "Password123!")))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.register(new RegisterRequest("User", "user@example.test", null, "ấ".repeat(25))))
                .isInstanceOf(BusinessException.class);
        verifyNoInteractions(accounts);
    }

    @Test void validatesRegistrationFields() {
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            assertThat(validator.validate(new RegisterRequest("User", null, "0912345678", "Password123!"))).isEmpty();
            assertThat(validator.validate(new RegisterRequest("", "bad", "phone", "short"))).hasSize(4);
            assertThat(validator.validate(new RegisterRequest("User", " ", " ", "Password123!"))).hasSize(1);
        }
    }
}
