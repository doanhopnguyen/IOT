package com.smartaccess.service;

import com.smartaccess.dto.account.AccountResponse;
import com.smartaccess.dto.account.RegisterRequest;
import com.smartaccess.dto.account.UpdateProfileRequest;
import com.smartaccess.dto.account.ChangePasswordRequest;
import com.smartaccess.exception.BusinessException;
import com.smartaccess.model.Account;
import com.smartaccess.model.enumtype.AccountStatus;
import com.smartaccess.repository.AccountRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.context.ApplicationEventPublisher;
import java.nio.charset.StandardCharsets;

@Service
@Transactional(readOnly = true)
public class AccountService {
    private final AccountRepository accounts;
    private final PasswordEncoder passwords;
    private final ApplicationEventPublisher events;

    public AccountService(AccountRepository accounts, PasswordEncoder passwords, ApplicationEventPublisher events) {
        this.accounts = accounts;
        this.passwords = passwords;
        this.events = events;
    }

    @Transactional
    public AccountResponse register(RegisterRequest request) {
        validatePassword(request.password());
        if (!request.isContactProvided()) {
            throw new BusinessException(HttpStatus.BAD_REQUEST, "Email or phone is required");
        }
        requireAvailableContacts(request.email(), request.phone(), null);
        Account account = new Account();
        account.setFullName(request.fullName());
        account.setEmail(request.email());
        account.setPhone(request.phone());
        account.setPasswordHash(passwords.encode(request.password()));
        account.setAdmin(false);
        account.setStatus(AccountStatus.ACTIVE);
        return AccountResponse.from(accounts.saveAndFlush(account));
    }

    public AccountResponse getProfile(Long accountId) {
        return AccountResponse.from(requireActiveAccount(accountId, false));
    }

    @Transactional
    public AccountResponse updateProfile(Long accountId, UpdateProfileRequest input) {
        Account account = requireActiveAccount(accountId, true);
        if (!input.isNotEmpty()) {
            throw new BusinessException(HttpStatus.BAD_REQUEST, "At least one profile field is required");
        }
        String email = input.email() == null ? account.getEmail() : emptyToNull(input.email());
        String phone = input.phone() == null ? account.getPhone() : emptyToNull(input.phone());
        if (email == null && phone == null) {
            throw new BusinessException(HttpStatus.BAD_REQUEST, "Email or phone is required");
        }
        requireAvailableContacts(email, phone, accountId);
        if (input.fullName() != null) { account.setFullName(input.fullName()); }
        account.setEmail(email);
        account.setPhone(phone);
        return AccountResponse.from(accounts.saveAndFlush(account));
    }

    @Transactional
    public void changePassword(Long accountId, ChangePasswordRequest input) {
        Account account = requireActiveAccount(accountId, true);
        validatePassword(input.newPassword());
        if (input.currentPassword().getBytes(StandardCharsets.UTF_8).length > 72
                || !passwords.matches(input.currentPassword(), account.getPasswordHash())) {
            throw new BusinessException(HttpStatus.BAD_REQUEST, "Current password is incorrect");
        }
        account.setPasswordHash(passwords.encode(input.newPassword()));
        accounts.saveAndFlush(account);
        events.publishEvent(new SessionsRevoked(accountId));
    }

    @Transactional
    public AccountResponse changeStatus(Long actorId, Long targetId, AccountStatus status) {
        Account actor = requireActiveAccount(actorId, false);
        if (!actor.isAdmin()) {
            throw new BusinessException(HttpStatus.FORBIDDEN, "Only admins can change account status");
        }
        if (targetId == null || targetId <= 0 || status == null) {
            throw new BusinessException(HttpStatus.BAD_REQUEST, "Positive account ID and status are required");
        }
        if (actorId.equals(targetId)) {
            throw new BusinessException(HttpStatus.FORBIDDEN, "Admins cannot change their own status");
        }
        Account target = accounts.findForUpdate(targetId)
                .orElseThrow(() -> new BusinessException(HttpStatus.NOT_FOUND, "Account not found"));
        if (target.isAdmin()) {
            throw new BusinessException(HttpStatus.FORBIDDEN, "Cannot change another admin's status");
        }
        if (target.getStatus() != status) {
            target.setStatus(status);
            accounts.saveAndFlush(target);
            events.publishEvent(new SessionsRevoked(targetId));
        }
        return AccountResponse.from(target);
    }

    private Account requireActiveAccount(Long accountId, boolean lock) {
        Account account = (lock ? accounts.findForUpdate(accountId) : accounts.findById(accountId))
                .orElseThrow(() -> new BusinessException(HttpStatus.UNAUTHORIZED, "Account is no longer available"));
        if (account.getStatus() != AccountStatus.ACTIVE) {
            throw new BusinessException(HttpStatus.UNAUTHORIZED, "Account is disabled");
        }
        return account;
    }

    private String emptyToNull(String value) { return value.isEmpty() ? null : value; }

    public record SessionsRevoked(Long accountId) {}

    private void requireAvailableContacts(String email, String phone, Long ownId) {
        if (email != null && accounts.findByEmailIgnoreCase(email)
                .filter(account -> !account.getAccountId().equals(ownId)).isPresent()) {
            throw new BusinessException(HttpStatus.CONFLICT, "Email is already in use");
        }
        if (phone != null && accounts.findByPhone(phone)
                .filter(account -> !account.getAccountId().equals(ownId)).isPresent()) {
            throw new BusinessException(HttpStatus.CONFLICT, "Phone is already in use");
        }
    }

    private void validatePassword(String password) {
        if (password == null || password.isBlank() || password.length() < 8
                || password.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new BusinessException(HttpStatus.BAD_REQUEST, "Password must have at least 8 characters and at most 72 UTF-8 bytes");
        }
    }
}
