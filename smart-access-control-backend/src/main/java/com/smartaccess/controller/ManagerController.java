package com.smartaccess.controller;

import com.smartaccess.dto.manager.*;
import com.smartaccess.service.ManagerService;
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
    public List<UserSearchResponse> searchUsers(@RequestParam Long managerId,
            @RequestParam String keyword, @RequestParam(defaultValue = "auto") String type) {
        return service.searchUsers(managerId, keyword, type);
    }

    @GetMapping("/units/{unitId}/users")
    public List<UnitUserResponse> getUsers(@RequestParam Long managerId, @PathVariable Long unitId) {
        return service.getUsers(managerId, unitId);
    }

    @PatchMapping("/units/{unitId}/users/{userId}/permissions")
    public UnitUserResponse updatePermissions(@RequestParam Long managerId, @PathVariable Long unitId,
            @PathVariable Long userId, @RequestBody PermissionRequest request) {
        return service.updatePermissions(managerId, unitId, userId, request);
    }

    @DeleteMapping("/units/{unitId}/users/{userId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeUser(@RequestParam Long managerId, @PathVariable Long unitId, @PathVariable Long userId) {
        service.removeUser(managerId, unitId, userId);
    }

    @PostMapping("/units/{unitId}/devices")
    @ResponseStatus(HttpStatus.CREATED)
    public DeviceResponse registerDevice(@RequestParam Long managerId, @PathVariable Long unitId,
            @Valid @RequestBody RegisterDeviceRequest request) {
        return service.registerDevice(managerId, unitId, request);
    }
}
