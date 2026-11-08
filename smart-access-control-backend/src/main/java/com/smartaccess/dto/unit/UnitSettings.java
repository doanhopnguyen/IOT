package com.smartaccess.dto.unit;

import com.smartaccess.model.AccessUnit;

/** Tham số cửa chủ cửa chỉnh từ xa. Request: trường null = giữ nguyên. */
public final class UnitSettings {
    private UnitSettings() {}

    public record Request(Integer unlockDurationSec, Integer doorOpenTimeoutSec, Boolean remoteUnlockEnabled,
            Boolean rfidEnabled, Boolean fingerprintEnabled,Boolean autoLockWaitForClose,Integer pinFailureLimit) {
        public Request(Integer seconds,Integer timeout,Boolean remote,Boolean rfid,Boolean finger) {
            this(seconds,timeout,remote,rfid,finger,null,null);
        }
        public Request(Integer seconds,Integer timeout,Boolean remote,Boolean rfid,Boolean finger,Boolean wait) {
            this(seconds,timeout,remote,rfid,finger,wait,null);
        }
        public boolean isEmpty() {
            return unlockDurationSec == null && doorOpenTimeoutSec == null && remoteUnlockEnabled == null
                    && rfidEnabled == null && fingerprintEnabled == null && autoLockWaitForClose == null && pinFailureLimit == null;
        }
    }

    public record Response(int unlockDurationSec, int doorOpenTimeoutSec, boolean remoteUnlockEnabled,
            boolean rfidEnabled, boolean fingerprintEnabled,boolean autoLockWaitForClose,int pinFailureLimit) {
        public Response(int seconds,int timeout,boolean remote,boolean rfid,boolean finger) {
            this(seconds,timeout,remote,rfid,finger,true,5);
        }
        public Response(int seconds,int timeout,boolean remote,boolean rfid,boolean finger,boolean wait) {
            this(seconds,timeout,remote,rfid,finger,wait,5);
        }
        public static Response from(AccessUnit unit) {
            return new Response(unit.getUnlockDurationSec(), unit.getDoorOpenTimeoutSec(), unit.isRemoteUnlockEnabled(),
                    unit.isRfidEnabled(), unit.isFingerprintEnabled(),unit.isAutoLockWaitForClose(),unit.getPinFailureLimit().intValue());
        }
    }
}
