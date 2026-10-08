package com.smartaccess.dto.manager;

import com.smartaccess.model.UserAccess;
import com.smartaccess.model.enumtype.AccountStatus;

public record UnitUserResponse(Long userId, String account, String email, String displayName,
        AccountStatus accountStatus, boolean allowFace, boolean allowFingerprint,
        boolean allowRfid, boolean allowRemoteUnlock) {
    public static UnitUserResponse from(UserAccess access) {
        var account = access.getAccount();
        return new UnitUserResponse(account.getAccountId(), account.getAccountId().toString(),
                account.getEmail(), account.getFullName(), account.getStatus(), access.isAllowFace(),
                access.isAllowFingerprint(), access.isAllowRfid(), access.isAllowRemoteUnlock());
    }
}
