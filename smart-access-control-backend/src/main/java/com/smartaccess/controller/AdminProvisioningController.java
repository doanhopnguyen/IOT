package com.smartaccess.controller;

import com.smartaccess.service.DeploymentService;
import com.smartaccess.service.DeviceProvisioningService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/** Thêm thiết bị trước, nạp qua Web Serial hoặc USB máy backend. */
@RestController
public class AdminProvisioningController {
    public record Pending(@NotBlank @Size(max = 100) String name) {}
    public record Flash(@NotBlank String port, @NotNull Long releaseId, @NotBlank @Size(max = 200) String password) {}
    public record BrowserFlash(@NotBlank @Pattern(regexp="(?i)[0-9a-f]{2}(:[0-9a-f]{2}){5}") String factoryMac,
            @NotNull Long releaseId, @NotBlank @Size(max=200) String password) {}
    public record BrowserVerified(@NotBlank @Pattern(regexp="(?i)[0-9a-f]{12}") String factoryMac,
            @NotBlank @Size(max=100) String uid) {}
    private final DeploymentService deployment;
    private final DeviceProvisioningService provisioning;
    public AdminProvisioningController(DeploymentService deployment, DeviceProvisioningService provisioning) {
        this.deployment = deployment; this.provisioning = provisioning;
    }
    @PostMapping("/api/admin/inventory/pending") @ResponseStatus(HttpStatus.CREATED)
    public DeploymentService.InventoryView create(@Valid @RequestBody Pending input) { return deployment.createPending(input.name()); }
    @DeleteMapping("/api/admin/inventory/pending/{deviceId}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long deviceId) { provisioning.deletePending(deviceId); }
    public record Reauth(@NotBlank @Size(max = 200) String password) {}
    /** Thiết bị đã thu hồi: giữ lịch sử, trả MAC/UID để chip được nạp lại thành thiết bị mới. */
    @PostMapping("/api/admin/inventory/{deviceId}/release-chip")
    public DeploymentService.InventoryView releaseChip(@PathVariable Long deviceId, @Valid @RequestBody Reauth input) {
        return deployment.releaseChip(deviceId, input.password());
    }
    @PostMapping("/api/admin/inventory/{deviceId}/flash") @ResponseStatus(HttpStatus.ACCEPTED)
    public DeviceProvisioningService.JobView flash(@PathVariable Long deviceId, @Valid @RequestBody Flash input) {
        return provisioning.start(deviceId, input.port(), input.releaseId(), input.password());
    }
    @GetMapping("/api/admin/provisioning-jobs/{jobId}")
    public DeviceProvisioningService.JobView job(@PathVariable String jobId) { return provisioning.job(jobId); }

    @PostMapping("/api/admin/inventory/{deviceId}/browser-flash")
    public ResponseEntity<DeviceProvisioningService.BrowserSession> browserFlash(@PathVariable Long deviceId,
            @Valid @RequestBody BrowserFlash input) {
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(provisioning.prepareBrowser(deviceId, input.factoryMac(), input.releaseId(), input.password()));
    }
    @GetMapping("/api/admin/browser-flash/{jobId}/image")
    public ResponseEntity<byte[]> browserImage(@PathVariable String jobId) {
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "no-store")
                .contentType(MediaType.APPLICATION_OCTET_STREAM).body(provisioning.browserImage(jobId));
    }
    @PostMapping("/api/admin/browser-flash/{jobId}/complete")
    public ResponseEntity<DeviceProvisioningService.JobView> browserComplete(@PathVariable String jobId,
            @Valid @RequestBody BrowserVerified input) {
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(provisioning.completeBrowser(jobId, input.factoryMac(), input.uid()));
    }
    @DeleteMapping("/api/admin/browser-flash/{jobId}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void browserCancel(@PathVariable String jobId) { provisioning.cancelBrowser(jobId); }
}
