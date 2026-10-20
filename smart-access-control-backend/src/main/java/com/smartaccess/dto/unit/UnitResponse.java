package com.smartaccess.dto.unit;

import java.time.LocalDateTime;

/** role: OWNER khi là manager của cửa, USER khi là thành viên. */
public record UnitResponse(Long unitId, String unitName, String role, boolean online,
        long memberCount, boolean canRemoteUnlock, LocalDateTime lastSeenAt) {}