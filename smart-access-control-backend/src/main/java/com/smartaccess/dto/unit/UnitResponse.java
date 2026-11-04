package com.smartaccess.dto.unit;

import java.time.LocalDateTime;

/** role: OWNER khi là manager của cửa, USER khi là thành viên. */
public record UnitResponse(Long unitId, String unitName, String role, boolean online,
        long memberCount, boolean canRemoteUnlock, LocalDateTime lastSeenAt,
        Boolean doorClosed,Boolean latchReleased,String activationState,String deviceUid) {
    public UnitResponse(Long id,String name,String role,boolean online,long count,boolean remote,LocalDateTime seen) {
        this(id,name,role,online,count,remote,seen,null,null,null,null);
    }
}
