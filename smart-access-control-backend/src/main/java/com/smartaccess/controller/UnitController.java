package com.smartaccess.controller;

import com.smartaccess.dto.unit.CreateUnitRequest;
import com.smartaccess.dto.unit.UnitResponse;
import com.smartaccess.security.AccountPrincipal;
import com.smartaccess.service.UnitService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/units")
public class UnitController {
    private final UnitService service;

    public UnitController(UnitService service) { this.service = service; }

    @GetMapping
    public List<UnitResponse> mine(@AuthenticationPrincipal AccountPrincipal principal) {
        return service.listMine(principal.accountId());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public UnitResponse create(@AuthenticationPrincipal AccountPrincipal principal,
            @Valid @RequestBody CreateUnitRequest request) {
        return service.create(principal.accountId(), request);
    }

    @DeleteMapping("/{unitId}/membership")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void leave(@AuthenticationPrincipal AccountPrincipal principal, @PathVariable Long unitId) {
        service.leave(principal.accountId(), unitId);
    }
}
