package com.smartaccess.service;

import com.smartaccess.model.*;
import com.smartaccess.model.enumtype.*;
import com.smartaccess.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;

/** Snapshot of the permissions the controller may use while offline. Never exports password/PIN hashes. */
@Service
public class LocalAccessPolicyService {
    private final DeviceRepository devices;
    private final CredentialRepository credentials;
    private final UserAccessRepository memberships;

    public LocalAccessPolicyService(DeviceRepository devices, CredentialRepository credentials,
                                    UserAccessRepository memberships) {
        this.devices = devices; this.credentials = credentials; this.memberships = memberships;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> snapshot(String uid) {
        Device device = devices.findByDeviceUid(uid).orElseThrow();
        AccessUnit unit = device.getAccessUnit();
        Map<Long, UserAccess> members = new HashMap<>();
        memberships.findMembersByUnitId(unit.getUnitId()).forEach(m -> members.put(m.getAccount().getAccountId(), m));
        List<String> rfid = new ArrayList<>();
        List<Integer> fingerprints = new ArrayList<>();
        for (CredentialType type : List.of(CredentialType.RFID, CredentialType.FINGERPRINT)) {
            for (Credential c : credentials.findByDevice_DeviceIdAndCredentialTypeAndStatus(
                    device.getDeviceId(), type, CredentialStatus.ACTIVE)) {
                UserAccess member = members.get(c.getAccount().getAccountId());
                if (c.getAccount().getStatus() != AccountStatus.ACTIVE || member == null) continue;
                if (type == CredentialType.RFID && unit.isRfidEnabled() && member.isAllowRfid() && c.getRfidUid() != null)
                    rfid.add(c.getRfidUid());
                if (type == CredentialType.FINGERPRINT && unit.isFingerprintEnabled() && member.isAllowFingerprint()
                        && c.getLocalTemplateId() != null) fingerprints.add(c.getLocalTemplateId().intValue());
            }
        }
        return Map.of("rfid", rfid, "fingerprints", fingerprints,
                "pinEnabled", unit.isPinEnabled(), "unlockDurationSec", unit.getUnlockDurationSec().intValue(),
                "doorOpenTimeoutSec", unit.getDoorOpenTimeoutSec().intValue(),"autoLockWaitForClose",unit.isAutoLockWaitForClose());
    }
}
