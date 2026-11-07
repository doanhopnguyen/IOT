package com.smartaccess.controller;

import com.smartaccess.service.*;
import com.smartaccess.repository.AccountRepository;
import com.smartaccess.dto.account.AccountResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
public class DeploymentController {
    public record Register(@NotBlank String factoryMac,@NotBlank @Size(max=100) String name){}
    public record Claim(@NotBlank String activationCode,@NotBlank @Size(max=100) String name){}
    public record Inspect(@NotBlank String activationCode){}
    public record Reset(@NotBlank @Size(max=200) String password,@NotBlank @Pattern(regexp="[0-9]{6}") String adminPin,
                        @NotBlank String confirmation,String recipientEmail){}
    public record Password(@NotBlank String password){}
    public record SyncCode(@NotBlank String password,@NotBlank String activationCode){}
    private final DeploymentService service;
    private final AccountRepository accounts;
    public DeploymentController(DeploymentService service,AccountRepository accounts){this.service=service;this.accounts=accounts;}
    @GetMapping("/api/admin/inventory") public Object list(){return service.list();}
    @PostMapping("/api/admin/inventory") public Object register(@Valid @RequestBody Register r){return service.register(r.factoryMac(),r.name());}
    @GetMapping("/api/admin/accounts") public Object accounts(){return accounts.findAll().stream().map(AccountResponse::from).toList();}
    @GetMapping("/api/activation/mine") public Object mine(){return service.mine();}
    @PostMapping("/api/activation/claim") public Object claim(@Valid @RequestBody Claim r){return service.claim(r.activationCode(),r.name());}
    @PostMapping("/api/activation/inspect") public Object inspect(@Valid @RequestBody Inspect r){return service.inspect(r.activationCode());}
    @GetMapping("/api/activation/devices/{uid}") public Object status(@PathVariable String uid){return service.status(uid);}
    @PostMapping({"/api/activation/devices/{uid}/reset","/api/admin/inventory/{uid}/reset"})
    public Object reset(@PathVariable String uid,@Valid @RequestBody Reset r){return service.startReset(uid,r.password(),r.adminPin(),r.confirmation(),r.recipientEmail());}
    @PostMapping({"/api/activation/devices/{uid}/issue-code","/api/admin/inventory/{uid}/issue-code"})
    public Object code(@PathVariable String uid,@Valid @RequestBody Password r){return service.issueAfterReset(uid,r.password());}
    @PostMapping({"/api/activation/devices/{uid}/sync-code","/api/admin/inventory/{uid}/sync-code"})
    public Object syncCode(@PathVariable String uid,@Valid @RequestBody SyncCode r){return service.syncActivationCode(uid,r.password(),r.activationCode());}
}
