package com.smartaccess.controller;
import com.smartaccess.service.InvitationService;
import org.springframework.web.bind.annotation.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
@RestController
public class InvitationController {
 public record Invite(@NotNull @Positive Long userId){}
 public record Decision(boolean accept){}
 private final InvitationService service;
 public InvitationController(InvitationService service){this.service=service;}
 @PostMapping("/api/manager/units/{unitId}/invitations") public Object invite(@PathVariable Long unitId,@Valid @RequestBody Invite input){return service.invite(unitId,input.userId());}
 @GetMapping("/api/invitations")public Object mine(){return service.mine();}
 @PostMapping("/api/invitations/{id}/response")public Object respond(@PathVariable Long id,@RequestBody Decision d){return service.respond(id,d.accept());}
}
