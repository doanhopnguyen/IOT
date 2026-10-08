package com.smartaccess.dto.manager;

import com.smartaccess.model.Account;
import com.smartaccess.model.enumtype.AccountStatus;

public record UserSearchResponse(Long id, String account, String email, String displayName, AccountStatus status) {
    public static UserSearchResponse from(Account account) {
        return new UserSearchResponse(account.getAccountId(), account.getAccountId().toString(),
                account.getEmail(), account.getFullName(), account.getStatus());
    }
}
