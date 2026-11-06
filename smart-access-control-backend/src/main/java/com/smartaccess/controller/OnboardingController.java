package com.smartaccess.controller;
import com.smartaccess.security.AccountPrincipal;
import com.smartaccess.service.OnboardingService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/manager/units/{unitId}")
public class OnboardingController {
    public record Pins(String pin,String confirmPin,String adminPin,String confirmAdminPin) {}
    public record Servo(Integer lockAngle,Integer openAngle) {}
    private final OnboardingService service;
    public OnboardingController(OnboardingService service){this.service=service;}
    @GetMapping("/setup") public Object status(@AuthenticationPrincipal AccountPrincipal p,@PathVariable Long unitId){return service.status(p.accountId(),unitId);}
    @PostMapping("/setup/credentials") public Object pins(@AuthenticationPrincipal AccountPrincipal p,@PathVariable Long unitId,@RequestBody Pins r){
        return service.credentials(p.accountId(),unitId,r.pin(),r.confirmPin(),r.adminPin(),r.confirmAdminPin());
    }
    @PostMapping("/setup/calibrate") public Object calibrate(@AuthenticationPrincipal AccountPrincipal p,@PathVariable Long unitId){return service.calibrate(p.accountId(),unitId);}
    @PostMapping("/wifi-setup") public Object wifi(@AuthenticationPrincipal AccountPrincipal p,@PathVariable Long unitId){return service.wifi(p.accountId(),unitId);}
    @GetMapping("/servo") public Object servo(@AuthenticationPrincipal AccountPrincipal p,@PathVariable Long unitId){return service.servoAngles(p.accountId(),unitId);}
    @PutMapping("/servo") public Object servo(@AuthenticationPrincipal AccountPrincipal p,@PathVariable Long unitId,@RequestBody Servo r){
        return service.setServoAngles(p.accountId(),unitId,r.lockAngle(),r.openAngle());
    }
}
