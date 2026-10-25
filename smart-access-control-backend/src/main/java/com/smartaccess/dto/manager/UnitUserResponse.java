package com.smartaccess.dto.manager;

import com.smartaccess.model.UserAccess;
import com.smartaccess.model.enumtype.AccountStatus;

/**
 * hasLoggedIn = false: tài khoản do chủ cửa tạo và người đó chưa từng đăng nhập.
 * deletableAccount = true: xóa khỏi cửa này sẽ xóa (hoặc ẩn) luôn tài khoản.
 */
public record UnitUserResponse(Long userId, String account, String email, String phone, String displayName,
        AccountStatus accountStatus, boolean allowFace, boolean allowFingerprint,
        boolean allowRfid, boolean allowRemoteUnlock, String room, boolean hasLoggedIn, boolean deletableAccount) {
    public static UnitUserResponse from(UserAccess access) {
        return from(access, null, true, false);
    }

    public static UnitUserResponse from(UserAccess access, String room, boolean hasLoggedIn, boolean deletableAccount) {
        var account = access.getAccount();
        return new UnitUserResponse(account.getAccountId(), account.getAccountId().toString(),
                account.getEmail(), account.getPhone(), account.getFullName(), account.getStatus(), access.isAllowFace(),
                access.isAllowFingerprint(), access.isAllowRfid(), access.isAllowRemoteUnlock(),
                room, hasLoggedIn, deletableAccount);
    }
}
