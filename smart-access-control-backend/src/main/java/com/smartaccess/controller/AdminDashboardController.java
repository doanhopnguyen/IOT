package com.smartaccess.controller;

import com.smartaccess.exception.BusinessException;
import com.smartaccess.service.AdminDashboardService;
import com.smartaccess.service.CurrentAccountService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import static org.springframework.http.HttpStatus.FORBIDDEN;

@RestController
public class AdminDashboardController {
    private final AdminDashboardService dashboard;
    private final CurrentAccountService current;

    public AdminDashboardController(AdminDashboardService dashboard, CurrentAccountService current) {
        this.dashboard = dashboard;
        this.current = current;
    }

    @GetMapping("/api/admin/dashboard")
    public AdminDashboardService.Summary summary() {
        if (!current.requireAccount().isAdmin()) throw new BusinessException(FORBIDDEN, "Chỉ admin xem được tổng quan hệ thống");
        return dashboard.summary();
    }
}
