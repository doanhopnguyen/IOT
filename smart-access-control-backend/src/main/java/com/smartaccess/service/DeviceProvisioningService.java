package com.smartaccess.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartaccess.exception.BusinessException;
import com.smartaccess.model.Account;
import com.smartaccess.model.FirmwareRelease;
import com.smartaccess.repository.FirmwareReleaseRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import static org.springframework.http.HttpStatus.*;

/**
 * Nạp code cho thiết bị đã thêm trước: đọc MAC → gắn chip → tạo tài khoản MQTT → ghi factory image
 * → nạp gói FACTORY → xác minh → mở mã nhận cửa. Broker được tạo trước khi xoá flash, nên lỗi broker
 * không làm hỏng chip. Trạng thái job chỉ nằm trong bộ nhớ; bí mật không bao giờ nằm trong JobView.
 */
@Service
public class DeviceProvisioningService {
    public enum Stage { READING_MAC, BINDING, BROKER, FLASHING, PROVISIONING, VERIFYING, DONE, FAILED }
    public record JobView(String jobId, Long deviceId, Stage stage, Stage failedAt, String error, DeploymentService.Issued result) {}
    private static final Logger log = LoggerFactory.getLogger(DeviceProvisioningService.class);
    private static final Duration KEEP = Duration.ofMinutes(30);
    private static final String HARDWARE = "esp32s3-n16r8";

    private static final class Job {
        final String id = UUID.randomUUID().toString();
        final Long deviceId; final Long actorId;
        volatile Stage stage = Stage.READING_MAC; volatile Stage failedAt; volatile String error;
        volatile DeploymentService.Issued result; volatile Instant finishedAt;
        Job(Long deviceId, Long actorId) { this.deviceId = deviceId; this.actorId = actorId; }
    }

    private final DeploymentService deployment;
    private final UsbDeviceService usb;
    private final BrokerAccounts brokers;
    private final FactoryConnection connection;
    private final FirmwareReleaseRepository releases;
    private final CurrentAccountService current;
    private final PasswordEncoder passwords;
    private final ObjectMapper json;
    private final ProvisioningExecutor executor;
    private final Map<String, Job> jobs = new ConcurrentHashMap<>();
    private final Map<Long, String> running = new ConcurrentHashMap<>();

    public DeviceProvisioningService(DeploymentService deployment, UsbDeviceService usb, BrokerAccounts brokers,
            FactoryConnection connection, FirmwareReleaseRepository releases, CurrentAccountService current,
            PasswordEncoder passwords, ObjectMapper json, ProvisioningExecutor executor) {
        this.deployment = deployment; this.usb = usb; this.brokers = brokers; this.connection = connection;
        this.releases = releases; this.current = current; this.passwords = passwords; this.json = json; this.executor = executor;
    }

    public JobView start(Long deviceId, String port, Long releaseId, String password) {
        Account actor = admin();
        if (password == null || !passwords.matches(password, actor.getPasswordHash()))
            throw new BusinessException(FORBIDDEN, "Cần xác thực lại mật khẩu tài khoản");
        connection.requireConfigured();
        if (!usb.enabled()) throw new BusinessException(SERVICE_UNAVAILABLE, "Backend chưa bật công cụ đọc USB");
        if (port == null || !port.matches("(?i)COM[1-9][0-9]{0,3}")) throw new BusinessException(BAD_REQUEST, "Cổng USB không hợp lệ");
        FirmwareRelease release = releaseId == null ? null : releases.findById(releaseId).orElse(null);
        if (release == null) throw new BusinessException(NOT_FOUND, "Không tìm thấy bản firmware");
        if (!HARDWARE.equals(release.getHardwareVersion()) || release.getFactorySha256() == null)
            throw new BusinessException(CONFLICT, "Bản firmware này chưa có factory image; phát hành lại kèm factory image");
        deployment.requireFlashable(deviceId);
        Job job = new Job(deviceId, actor.getAccountId());
        if (running.putIfAbsent(deviceId, job.id) != null) throw new BusinessException(CONFLICT, "Thiết bị đang được nạp");
        prune();
        jobs.put(job.id, job);
        try {
            executor.execute(() -> run(job, port.toUpperCase(Locale.ROOT), releaseId));
        } catch (RuntimeException e) {
            running.remove(deviceId); jobs.remove(job.id);
            throw new BusinessException(SERVICE_UNAVAILABLE, "Không bắt đầu được job nạp code");
        }
        return view(job, true);
    }

    /** Xoá thiết bị chờ nạp; giữ chỗ trong `running` để không có job nào bắt đầu giữa chừng. */
    public void deletePending(Long deviceId) {
        admin();
        String marker = "delete-" + UUID.randomUUID();
        if (running.putIfAbsent(deviceId, marker) != null) throw new BusinessException(CONFLICT, "Thiết bị đang được nạp");
        try { deployment.deletePending(deviceId); }
        finally { running.remove(deviceId, marker); }
    }

    public JobView job(String jobId) {
        Account actor = admin();
        Job job = jobs.get(jobId);
        if (job == null) throw new BusinessException(NOT_FOUND, "Không tìm thấy job nạp code");
        return view(job, Objects.equals(job.actorId, actor.getAccountId()));
    }

    private void run(Job job, String port, Long releaseId) {
        try {
            String mac = usb.read(port).factoryMac();
            job.stage = Stage.BINDING;
            DeploymentService.FactoryBundle bundle = deployment.bindForFlash(job.deviceId, mac, job.actorId);
            String uid = bundle.device().deviceUid();
            job.stage = Stage.BROKER;
            brokers.upsertDevice(uid, bundle.mqttPassword());
            job.stage = Stage.FLASHING;
            byte[] image = releases.findById(releaseId).map(FirmwareRelease::getFactoryImage)
                    .orElseThrow(() -> new BusinessException(NOT_FOUND, "Không tìm thấy bản firmware"));
            usb.flash(port, image);
            job.stage = Stage.PROVISIONING;
            UsbDeviceService.Provisioned chip = usb.provision(port, json.writeValueAsString(bundle.serialPayload()));
            job.stage = Stage.VERIFYING;
            String expectedMac = String.valueOf(bundle.serialPayload().get("factoryMac"));
            if (!uid.equals(chip.uid()) || !expectedMac.equalsIgnoreCase(chip.factoryMac()))
                throw new BusinessException(CONFLICT, "Chip khởi động lại với danh tính khác gói vừa nạp");
            job.result = deployment.markFlashed(releaseId, bundle);
            job.stage = Stage.DONE;
        } catch (BusinessException e) {
            fail(job, e.getMessage());
        } catch (ResponseStatusException e) {
            fail(job, e.getReason());
        } catch (Exception e) {
            log.warn("Job nạp code {} lỗi: {}", job.id, e.getClass().getSimpleName());
            fail(job, "Nạp code thất bại; thử lại");
        } finally {
            job.finishedAt = Instant.now();
            running.remove(job.deviceId, job.id);
        }
    }

    private static void fail(Job job, String message) {
        job.failedAt = job.stage; job.error = message; job.stage = Stage.FAILED;
    }

    private void prune() {
        Instant limit = Instant.now().minus(KEEP);
        jobs.values().removeIf(j -> j.finishedAt != null && j.finishedAt.isBefore(limit));
    }

    private static JobView view(Job job, boolean owner) {
        return new JobView(job.id, job.deviceId, job.stage, job.failedAt, job.error, owner ? job.result : null);
    }

    private Account admin() {
        Account a = current.requireAccount();
        if (!a.isAdmin()) throw new BusinessException(FORBIDDEN, "Chỉ admin hệ thống được nạp code");
        return a;
    }
}
