package com.smartaccess.service;

import com.smartaccess.dto.account.AccountResponse;
import com.smartaccess.dto.account.RegisterRequest;
import com.smartaccess.exception.BusinessException;
import com.smartaccess.model.Account;
import com.smartaccess.model.enumtype.AccountStatus;
import com.smartaccess.repository.AccountRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.nio.charset.StandardCharsets;

@Service
@Transactional(readOnly = true)
public class AccountService {
    private final AccountRepository accounts;
    private final PasswordEncoder passwords;

    public AccountService(AccountRepository accounts, PasswordEncoder passwords) {
        this.accounts = accounts;
        this.passwords = passwords;
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
