package com.smartaccess.controller;

import com.smartaccess.dto.manager.*;
import com.smartaccess.service.ManagerService;
import com.smartaccess.security.AccountPrincipal;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/manager")
public class ManagerController {
    private final ManagerService service;

    public ManagerController(ManagerService service) { this.service = service; }

    @GetMapping("/users/search")
    public List<UserSearchResponse> searchUsers(@AuthenticationPrincipal AccountPrincipal principal,
            @RequestParam String keyword, @RequestParam(defaultValue = "auto") String type) {
        return service.searchUsers(principal.accountId(), keyword, type);
    }

    @GetMapping("/units/{unitId}/users")
    public List<UnitUserResponse> getUsers(@AuthenticationPrincipal AccountPrincipal principal, @PathVariable Long unitId) {
        return service.getUsers(principal.accountId(), unitId);
    }

    @PostMapping("/units/{unitId}/users/{userId}")
    @ResponseStatus(HttpStatus.CREATED)
    public UnitUserResponse addUser(@AuthenticationPrincipal AccountPrincipal principal, @PathVariable Long unitId,
            @PathVariable Long userId) {
        return service.addUser(principal.accountId(), unitId, userId);
    }

    @PostMapping("/units/{unitId}/member-profiles")
    @ResponseStatus(HttpStatus.CREATED)
    public UnitUserResponse createMemberProfile(@AuthenticationPrincipal AccountPrincipal principal, @PathVariable Long unitId,
            @Valid @RequestBody CreateMemberProfileRequest request) {
        return service.createMemberProfile(principal.accountId(), unitId, request);
    }

    @PatchMapping("/units/{unitId}/users/{userId}/permissions")
    public UnitUserResponse updatePermissions(@AuthenticationPrincipal AccountPrincipal principal, @PathVariable Long unitId,
            @PathVariable Long userId, @RequestBody PermissionRequest request) {
        return service.updatePermissions(principal.accountId(), unitId, userId, request);
    }

    @DeleteMapping("/units/{unitId}/users/{userId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeUser(@AuthenticationPrincipal AccountPrincipal principal, @PathVariable Long unitId, @PathVariable Long userId) {
        service.removeUser(principal.accountId(), unitId, userId);
    }

    @PostMapping("/units/{unitId}/devices")
    @ResponseStatus(HttpStatus.CREATED)
    public DeviceResponse registerDevice(@AuthenticationPrincipal AccountPrincipal principal, @PathVariable Long unitId,
            @Valid @RequestBody RegisterDeviceRequest request) {
        return service.registerDevice(principal.accountId(), unitId, request);
    }
}
