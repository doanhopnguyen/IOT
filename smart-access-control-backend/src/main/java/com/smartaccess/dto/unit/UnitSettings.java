package com.smartaccess.dto.unit;

import com.smartaccess.model.AccessUnit;

/** Tham số cửa chủ cửa chỉnh từ xa. Request: trường null = giữ nguyên. */
public final class UnitSettings {
    private UnitSettings() {}

    public record Request(Integer unlockDurationSec, Integer doorOpenTimeoutSec, Boolean remoteUnlockEnabled,
            Boolean rfidEnabled, Boolean fingerprintEnabled,Boolean autoLockWaitForClose) {
        public Request(Integer seconds,Integer timeout,Boolean remote,Boolean rfid,Boolean finger) {
            this(seconds,timeout,remote,rfid,finger,null);
        }
        public boolean isEmpty() {
            return unlockDurationSec == null && doorOpenTimeoutSec == null && remoteUnlockEnabled == null
                    && rfidEnabled == null && fingerprintEnabled == null && autoLockWaitForClose == null;
        }
    }

    public record Response(int unlockDurationSec, int doorOpenTimeoutSec, boolean remoteUnlockEnabled,
            boolean rfidEnabled, boolean fingerprintEnabled,boolean autoLockWaitForClose) {
        public Response(int seconds,int timeout,boolean remote,boolean rfid,boolean finger) {
            this(seconds,timeout,remote,rfid,finger,true);
        }
        public static Response from(AccessUnit unit) {
            return new Response(unit.getUnlockDurationSec(), unit.getDoorOpenTimeoutSec(), unit.isRemoteUnlockEnabled(),
                    unit.isRfidEnabled(), unit.isFingerprintEnabled(),unit.isAutoLockWaitForClose());
        }
    }
}
