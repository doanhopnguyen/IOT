package com.smartaccess.controller;

import com.smartaccess.dto.FaceDtos.*;
import com.smartaccess.service.FaceEnrollmentService;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import com.smartaccess.service.EdgeAiService;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/face-node")
public class FaceNodeController {
    private final FaceEnrollmentService service;
    private final EdgeAiService edge;
    public FaceNodeController(FaceEnrollmentService service, EdgeAiService edge) { this.service = service; this.edge = edge; }

    @PostMapping("/heartbeat")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void heartbeat(@RequestHeader("X-Device-Uid") String uid, @RequestHeader("X-Device-Secret") String secret,
                          @Valid @RequestBody(required = false) EdgeAiService.Health health) {
        edge.heartbeat(uid, secret, health);
    }

    @GetMapping("/templates")
    public Templates templates(@RequestHeader("X-Device-Uid") String uid, @RequestHeader("X-Device-Secret") String secret) {
        return service.templates(uid, secret);
    }

}
