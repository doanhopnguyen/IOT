package com.smartaccess.dto.account;

import com.smartaccess.model.Account;
import com.smartaccess.model.enumtype.AccountStatus;

public record AccountResponse(Long accountId, String fullName, String email, String phone,
        boolean admin, AccountStatus status) {
    public static AccountResponse from(Account account) {
        return new AccountResponse(account.getAccountId(), account.getFullName(), account.getEmail(),
                account.getPhone(), account.isAdmin(), account.getStatus());
    }
}
