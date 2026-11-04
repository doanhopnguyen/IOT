package com.smartaccess.controller;

import java.util.Map;
import org.springframework.web.bind.annotation.*;

@RestController
public class HealthController {
    @GetMapping("/api/health")
    public Map<String, Object> health() {
        return Map.of("application", "smart-door", "apiVersion", 1, "status", "READY");
    }
}
