package com.smartaccess.service;

import com.smartaccess.model.AccessLog;
import com.smartaccess.model.Credential;
import com.smartaccess.model.Device;
import com.smartaccess.model.enumtype.AccessMethod;
import com.smartaccess.model.enumtype.AccessResult;
import com.smartaccess.model.enumtype.CredentialStatus;
import com.smartaccess.model.enumtype.CredentialType;
import com.smartaccess.repository.AccessLogRepository;
import com.smartaccess.repository.CredentialRepository;
import com.smartaccess.repository.DeviceRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.util.UUID;

/** Ghi lượt quét vân tay mà thiết bị đã tự so khớp tại chỗ. */
@Service
public class AccessEventService {
    private static final Logger log = LoggerFactory.getLogger(AccessEventService.class);

    private final DeviceRepository devices;
    private final CredentialRepository credentials;
    private final AccessLogRepository accessLogs;

    public AccessEventService(DeviceRepository devices, CredentialRepository credentials,
            AccessLogRepository accessLogs) {
        this.devices = devices;
        this.credentials = credentials;
        this.accessLogs = accessLogs;
    }

    @Transactional
    public void recordFingerprint(String deviceUid, Integer templateId, boolean deviceGranted) {
        Device device = devices.findByDeviceUid(deviceUid).orElse(null);
        if (device == null || device.getAccessUnit() == null) {
            log.warn("Bỏ qua lượt quét từ thiết bị {} chưa gắn cửa", deviceUid);
            return;
        }
        Credential credential = templateId == null ? null : credentials
                .findFirstByDevice_DeviceIdAndCredentialTypeAndLocalTemplateIdAndStatus(device.getDeviceId(),
                        CredentialType.FINGERPRINT, templateId.shortValue(), CredentialStatus.ACTIVE)
                .orElse(null);

        AccessLog entry = new AccessLog();
        entry.setAccessUuid(UUID.randomUUID().toString());
        entry.setAccessUnit(device.getAccessUnit());
        entry.setSourceDevice(device);
        entry.setMethod(AccessMethod.FINGERPRINT);
        entry.setOccurredAt(LocalDateTime.now());
        if (!deviceGranted) {
            entry.setResult(AccessResult.DENIED);
            entry.setReasonCode("NO_MATCH");
        } else if (credential == null) {
            entry.setResult(AccessResult.DENIED);
            entry.setReasonCode("CREDENTIAL_NOT_ACTIVE");
        } else {
            entry.setResult(AccessResult.GRANTED);
            entry.setAccount(credential.getAccount());
            entry.setCredential(credential);
        }
        accessLogs.save(entry);
    }
}
