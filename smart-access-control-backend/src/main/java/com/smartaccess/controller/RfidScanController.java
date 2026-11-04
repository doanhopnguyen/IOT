package com.smartaccess.controller;
import com.smartaccess.service.*;
import com.smartaccess.dto.manager.CommandResponse;
import org.springframework.web.bind.annotation.*;
@RestController
public class RfidScanController {
    private final RfidScanService service;
    private final CurrentAccountService current;
    public RfidScanController(RfidScanService service,CurrentAccountService current) { this.service=service; this.current=current; }
    @PostMapping("/api/manager/units/{unitId}/users/{userId}/rfid-scan")
    public CommandResponse start(@PathVariable Long unitId,@PathVariable Long userId) {
        return service.start(current.requireAccount().getAccountId(),unitId,userId);
    }
}
