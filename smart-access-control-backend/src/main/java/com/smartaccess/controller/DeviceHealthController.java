package com.smartaccess.controller;

import com.smartaccess.security.AccountPrincipal;
import com.smartaccess.service.DeviceHealthService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
public class DeviceHealthController {
    private final DeviceHealthService health;
    public DeviceHealthController(DeviceHealthService health) { this.health=health; }
    @GetMapping("/api/manager/units/{unitId}/health")
    public DeviceHealthService.Health get(@AuthenticationPrincipal AccountPrincipal actor, @PathVariable Long unitId) {
        return health.get(actor.accountId(),unitId);
    }
}
