package com.smartaccess.controller;

import com.smartaccess.dto.manager.CommandResponse;
import com.smartaccess.service.PinAlertResponseService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/alerts/{id}/pin-response")
public class PinAlertController {
    private final PinAlertResponseService service;
    public PinAlertController(PinAlertResponseService service){this.service=service;}
    public record Response(@NotNull PinAlertResponseService.Action action) {}
    @PostMapping public CommandResponse respond(@PathVariable Long id,@Valid @RequestBody Response response){
        return service.respond(id,response.action());
    }
}
