package com.smartaccess.service;

import com.smartaccess.dto.account.RegisterRequest;
import com.smartaccess.dto.account.UpdateProfileRequest;
import com.smartaccess.dto.account.ChangePasswordRequest;
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
import org.springframework.context.ApplicationEventPublisher;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import java.util.Optional;

@ExtendWith(MockitoExtension.class)
class AccountServiceTest {
    @Mock AccountRepository accounts;
    @Mock ApplicationEventPublisher events;
    BCryptPasswordEncoder passwords = new BCryptPasswordEncoder(4);
    AccountService service;

    @BeforeEach void setup() { service = new AccountService(accounts, passwords, events); }

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

    Account storedUser() {
        Account user = new Account(); user.setAccountId(2L); user.setFullName("User");
        user.setEmail("user@example.test"); user.setPhone("0912345678");
        user.setPasswordHash(passwords.encode("Password123!"));
        when(accounts.findForUpdate(2L)).thenReturn(Optional.of(user));
        return user;
    }

    @Test void updatesOnlySuppliedFieldsAndRetainsPrivilegesAndPassword() {
        Account user = storedUser(); String hash = user.getPasswordHash();
        when(accounts.saveAndFlush(user)).thenReturn(user);
        var response = service.updateProfile(2L, new UpdateProfileRequest(" New Name ", null, null));
        assertThat(response.fullName()).isEqualTo("New Name");
        assertThat(response.email()).isEqualTo("user@example.test");
        assertThat(response.phone()).isEqualTo("0912345678");
        assertThat(user.getPasswordHash()).isEqualTo(hash);
        assertThat(user.isAdmin()).isFalse();
        verifyNoInteractions(events);
    }

    @Test void refusesEmptyProfileOrRemovalOfLastContact() {
        Account user = storedUser(); user.setPhone(null);
        assertThatThrownBy(() -> service.updateProfile(2L, new UpdateProfileRequest(null, null, null))).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.updateProfile(2L, new UpdateProfileRequest(null, "", null))).isInstanceOf(BusinessException.class);
        assertThat(user.getEmail()).isEqualTo("user@example.test");
        verify(accounts, never()).saveAndFlush(any());
    }

    @Test void canClearOneContactButNotBoth() {
        Account user = storedUser(); when(accounts.saveAndFlush(user)).thenReturn(user);
        assertThat(service.updateProfile(2L, new UpdateProfileRequest(null, "", null)).email()).isNull();
        assertThat(user.getPhone()).isEqualTo("0912345678");
    }

    @Test void duplicateProfileContactDoesNotApplyOtherChanges() {
        Account user = storedUser(); Account other = new Account(); other.setAccountId(3L);
        when(accounts.findByEmailIgnoreCase("other@example.test")).thenReturn(Optional.of(other));
        assertThatThrownBy(() -> service.updateProfile(2L, new UpdateProfileRequest("Changed", "other@example.test", null)))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getStatus()).isEqualTo(HttpStatus.CONFLICT));
        assertThat(user.getFullName()).isEqualTo("User");
    }

    @Test void passwordChangeRequiresCorrectOldPasswordAndRevokesSessions() {
        Account user = storedUser();
        service.changePassword(2L, new ChangePasswordRequest("Password123!", "NewPassword123!"));
        assertThat(passwords.matches("NewPassword123!", user.getPasswordHash())).isTrue();
        assertThat(passwords.matches("Password123!", user.getPasswordHash())).isFalse();
        verify(events).publishEvent(new AccountService.SessionsRevoked(2L));
    }

    @Test void wrongOldPasswordDoesNotChangeHashOrRevokeSessions() {
        Account user = storedUser(); String hash = user.getPasswordHash();
        assertThatThrownBy(() -> service.changePassword(2L, new ChangePasswordRequest("WrongPassword", "NewPassword123!")))
                .isInstanceOf(BusinessException.class);
        assertThat(user.getPasswordHash()).isEqualTo(hash);
        verifyNoInteractions(events);
        verify(accounts, never()).saveAndFlush(any());
    }

    @Test void disabledAccountCannotModifyProfileOrPassword() {
        Account user = storedUser(); user.setStatus(AccountStatus.DISABLED);
        assertThatThrownBy(() -> service.updateProfile(2L, new UpdateProfileRequest("New Name", null, null)))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getStatus()).isEqualTo(HttpStatus.UNAUTHORIZED));
        assertThatThrownBy(() -> service.changePassword(2L, new ChangePasswordRequest("Password123!", "NewPassword123!")))
                .isInstanceOf(BusinessException.class);
        verifyNoInteractions(events);
    }
}
