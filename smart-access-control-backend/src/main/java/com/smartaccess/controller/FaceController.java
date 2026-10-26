package com.smartaccess.controller;

import com.smartaccess.dto.FaceDtos.*;
import com.smartaccess.service.FaceEnrollmentService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/faces")
public class FaceController {
    private final FaceEnrollmentService service;
    public FaceController(FaceEnrollmentService service) { this.service = service; }

    @PostMapping("/requests")
    @ResponseStatus(HttpStatus.CREATED)
    public RequestView create(@Valid @RequestBody CreateRequest request) { return service.create(request); }

    @GetMapping("/requests")
    public List<RequestView> list(@RequestParam(required = false) Long unitId) { return service.list(unitId); }

    @PostMapping("/requests/{id}/decision")
    public RequestView decide(@PathVariable Long id, @RequestBody Decision decision) { return service.decide(id, decision.approved()); }

    @PostMapping("/requests/{id}/cancel")
    public RequestView cancel(@PathVariable Long id) { return service.cancel(id); }

    @GetMapping("/me")
    public Profile profile() { return service.profile(); }

    @GetMapping("/accounts/{id}")
    public Profile profileForManager(@PathVariable Long id, @RequestParam Long unitId) { return service.profileForManager(id, unitId); }

    @DeleteMapping("/me")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void revoke() { service.revoke(); }
}
