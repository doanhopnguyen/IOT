package com.smartaccess.controller;

import com.smartaccess.dto.manager.AddFingerprintRequest;
import com.smartaccess.dto.manager.AssignRfidRequest;
import com.smartaccess.dto.manager.RfidCredentialResponse;
import com.smartaccess.dto.manager.ChangePinRequest;
import com.smartaccess.dto.manager.CommandResponse;
import com.smartaccess.security.AccountPrincipal;
import com.smartaccess.service.DeviceCommandService;
import com.smartaccess.service.FingerprintService;
import com.smartaccess.service.PinService;
import com.smartaccess.service.RemoteUnlockService;
import com.smartaccess.service.RfidService;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/manager")
public class ManagerCommandController {
    private final PinService pinService;
    private final FingerprintService fingerprintService;
    private final RemoteUnlockService remoteUnlockService;
    private final DeviceCommandService commandService;
    private final RfidService rfidService;

    public ManagerCommandController(PinService pinService, FingerprintService fingerprintService,
            RemoteUnlockService remoteUnlockService, DeviceCommandService commandService, RfidService rfidService) {
        this.pinService = pinService;
        this.fingerprintService = fingerprintService;
        this.remoteUnlockService = remoteUnlockService;
        this.commandService = commandService;
        this.rfidService = rfidService;
    }

    @PutMapping("/units/{unitId}/pin")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public CommandResponse changePin(@AuthenticationPrincipal AccountPrincipal principal, @PathVariable Long unitId,
            @RequestBody ChangePinRequest request) {
        return pinService.changePin(principal.accountId(), unitId, request);
    }

    @PostMapping("/units/{unitId}/users/{userId}/fingerprints")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public CommandResponse addFingerprint(@AuthenticationPrincipal AccountPrincipal principal, @PathVariable Long unitId,
            @PathVariable Long userId, @RequestBody AddFingerprintRequest request) {
        return fingerprintService.startEnroll(principal.accountId(), unitId, userId, request);
    }

    @DeleteMapping("/units/{unitId}/users/{userId}/fingerprints/{credentialId}")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public CommandResponse deleteFingerprint(@AuthenticationPrincipal AccountPrincipal principal, @PathVariable Long unitId,
            @PathVariable Long userId, @PathVariable Long credentialId) {
        return fingerprintService.startDelete(principal.accountId(), unitId, userId, credentialId);
    }

    @PostMapping("/units/{unitId}/users/{userId}/rfids")
    @ResponseStatus(HttpStatus.CREATED)
    public RfidCredentialResponse assignRfid(@AuthenticationPrincipal AccountPrincipal principal, @PathVariable Long unitId,
            @PathVariable Long userId, @RequestBody AssignRfidRequest request) {
        return rfidService.assign(principal.accountId(), unitId, userId, request == null ? null : request.rfidUid());
    }

    @DeleteMapping("/units/{unitId}/users/{userId}/rfids/{credentialId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void revokeRfid(@AuthenticationPrincipal AccountPrincipal principal, @PathVariable Long unitId,
            @PathVariable Long userId, @PathVariable Long credentialId) {
        rfidService.revoke(principal.accountId(), unitId, userId, credentialId);
    }

    @PostMapping("/units/{unitId}/unlock")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public CommandResponse unlock(@AuthenticationPrincipal AccountPrincipal principal, @PathVariable Long unitId) {
        return remoteUnlockService.unlock(principal.accountId(), unitId);
    }

    @GetMapping("/commands/{commandUuid}")
    public CommandResponse commandStatus(@AuthenticationPrincipal AccountPrincipal principal,
            @PathVariable String commandUuid) {
        return commandService.getOwnCommand(principal.accountId(), commandUuid);
    }
}
