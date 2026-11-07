package com.smartaccess.service;

import com.smartaccess.model.enumtype.DeviceLifecycleStatus;
import com.smartaccess.repository.DeviceRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.LongSupplier;

/**
 * Báo chip đã bị thu hồi để chip tự xóa dữ liệu và ngừng hẳn.
 * Không lưu bảng commands: chip đã mất secret nên ACK của nó không bao giờ xác thực được.
 * Chip offline lúc thu hồi sẽ được báo lại khi bản tin đầu tiên của nó bị từ chối (tối đa 1 lần/60 giây).
 * An toàn khi bị giả mạo: chỉ backend được ghi topic cmd, và lệnh chỉ gửi cho thiết bị đã DECOMMISSIONED.
 */
@Component
public class DecommissionNotifier {
    public static final String COMMAND = "DEVICE_DECOMMISSION";
    static final long RESEND_MS = 60_000;
    private static final Logger log = LoggerFactory.getLogger(DecommissionNotifier.class);
    private final DeviceRepository devices;
    private final DeviceGateway gateway;
    private final LongSupplier clock;
    private final Map<String, Long> lastSent = new ConcurrentHashMap<>();

    @Autowired
    public DecommissionNotifier(DeviceRepository devices, @Lazy DeviceGateway gateway) {
        this(devices, gateway, System::currentTimeMillis);
    }

    DecommissionNotifier(DeviceRepository devices, DeviceGateway gateway, LongSupplier clock) {
        this.devices = devices; this.gateway = gateway; this.clock = clock;
    }

    public void notifyNow(String deviceUid) {
        try {
            gateway.send(deviceUid, UUID.randomUUID().toString(), COMMAND, Map.of());
        } catch (RuntimeException offline) {
            log.info("Chưa báo được thu hồi tới {}; sẽ báo lại khi thiết bị kết nối", deviceUid);
        }
    }

    public void onRejected(String deviceUid) {
        boolean retired = devices.findByDeviceUid(deviceUid)
                .map(d -> d.getLifecycleStatus() == DeviceLifecycleStatus.DECOMMISSIONED).orElse(false);
        if (!retired) return;
        long now = clock.getAsLong();
        Long previous = lastSent.get(deviceUid);
        if (previous != null && now - previous < RESEND_MS) return;
        lastSent.put(deviceUid, now);
        notifyNow(deviceUid);
    }
}
