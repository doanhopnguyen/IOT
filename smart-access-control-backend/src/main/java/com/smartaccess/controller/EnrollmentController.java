package com.smartaccess.controller;
import com.smartaccess.dto.manager.CommandResponse;
import com.smartaccess.security.AccountPrincipal;
import com.smartaccess.service.EnrollmentService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
public class EnrollmentController {
    private final EnrollmentService service;
    public EnrollmentController(EnrollmentService service) { this.service=service; }
    @GetMapping("/api/manager/units/{unitId}/users/{userId}/enrollments/current")
    public CommandResponse current(@AuthenticationPrincipal AccountPrincipal actor, @PathVariable Long unitId, @PathVariable Long userId) {
        return service.current(actor.accountId(),unitId,userId);
    }
    @PostMapping("/api/manager/units/{unitId}/enrollments/{uuid}/cancel")
    public CommandResponse cancel(@AuthenticationPrincipal AccountPrincipal actor, @PathVariable Long unitId, @PathVariable String uuid) {
        return service.cancel(actor.accountId(),unitId,uuid);
    }
}
