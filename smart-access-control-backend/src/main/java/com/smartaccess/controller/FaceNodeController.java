package com.smartaccess.controller;

import com.smartaccess.dto.FaceDtos.*;
import com.smartaccess.service.FaceEnrollmentService;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/face-node")
public class FaceNodeController {
    private final FaceEnrollmentService service;
    public FaceNodeController(FaceEnrollmentService service) { this.service = service; }

    @PostMapping("/heartbeat")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void heartbeat(@RequestHeader("X-Device-Uid") String uid, @RequestHeader("X-Device-Secret") String secret) {
        service.heartbeat(uid, secret);
    }

    @GetMapping("/templates")
    public Templates templates(@RequestHeader("X-Device-Uid") String uid, @RequestHeader("X-Device-Secret") String secret) {
        return service.templates(uid, secret);
    }

}
