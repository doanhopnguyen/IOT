package com.smartaccess.dto.manager;

public record PermissionRequest(Boolean allowFace, Boolean allowFingerprint,
        Boolean allowRfid, Boolean allowRemoteUnlock) {
    public boolean isEmpty() {
        return allowFace == null && allowFingerprint == null && allowRfid == null && allowRemoteUnlock == null;
    }

    public boolean requestsGrant() {
        return Boolean.TRUE.equals(allowFace) || Boolean.TRUE.equals(allowFingerprint)
                || Boolean.TRUE.equals(allowRfid) || Boolean.TRUE.equals(allowRemoteUnlock);
    }
}
