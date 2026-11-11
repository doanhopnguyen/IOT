package com.smartaccess.controller;

import com.smartaccess.service.DeploymentService;
import com.smartaccess.service.DeviceProvisioningService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

/** Thêm thiết bị trước (chưa có chip), sau đó nạp code từ USB máy backend. */
@RestController
public class AdminProvisioningController {
    public record Pending(@NotBlank @Size(max = 100) String name) {}
    public record Flash(@NotBlank String port, @NotNull Long releaseId, @NotBlank @Size(max = 200) String password) {}
    private final DeploymentService deployment;
    private final DeviceProvisioningService provisioning;
    public AdminProvisioningController(DeploymentService deployment, DeviceProvisioningService provisioning) {
        this.deployment = deployment; this.provisioning = provisioning;
    }
    @PostMapping("/api/admin/inventory/pending") @ResponseStatus(HttpStatus.CREATED)
    public DeploymentService.InventoryView create(@Valid @RequestBody Pending input) { return deployment.createPending(input.name()); }
    @DeleteMapping("/api/admin/inventory/pending/{deviceId}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long deviceId) { deployment.deletePending(deviceId); }
    @PostMapping("/api/admin/inventory/{deviceId}/flash") @ResponseStatus(HttpStatus.ACCEPTED)
    public DeviceProvisioningService.JobView flash(@PathVariable Long deviceId, @Valid @RequestBody Flash input) {
        return provisioning.start(deviceId, input.port(), input.releaseId(), input.password());
    }
    @GetMapping("/api/admin/provisioning-jobs/{jobId}")
    public DeviceProvisioningService.JobView job(@PathVariable String jobId) { return provisioning.job(jobId); }
}
