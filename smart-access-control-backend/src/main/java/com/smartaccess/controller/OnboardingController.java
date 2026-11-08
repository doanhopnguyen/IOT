package com.smartaccess.controller;
import com.fasterxml.jackson.databind.JsonNode;
import com.smartaccess.exception.BusinessException;
import com.smartaccess.security.AccountPrincipal;
import com.smartaccess.service.OnboardingService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/manager/units/{unitId}")
public class OnboardingController {
    public record Pins(String pin,String confirmPin,String adminPin,String confirmAdminPin) {}
    public record Servo(JsonNode lockAngle,JsonNode openAngle,JsonNode servoRange,JsonNode openDirection) {}
    public record Preview(String target,JsonNode angle,JsonNode servoRange,JsonNode openDirection) {}
    private static Integer angle(JsonNode value) {
        if(value==null || value.isNull())return null;
        if(!value.isIntegralNumber() || !value.canConvertToInt())throw new BusinessException(
                HttpStatus.BAD_REQUEST,"Góc servo cần là số nguyên");
        return value.intValue();
    }
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
        return service.setServoAngles(p.accountId(),unitId,angle(r.lockAngle()),angle(r.openAngle()),angle(r.servoRange()),angle(r.openDirection()));
    }
    @PostMapping("/servo/preview") public Object preview(@AuthenticationPrincipal AccountPrincipal p,@PathVariable Long unitId,@RequestBody Preview r){
        return service.previewServo(p.accountId(),unitId,r.target(),angle(r.angle()),angle(r.servoRange()),angle(r.openDirection()));
    }
    @PostMapping("/servo/preview/stop") public Object stopPreview(@AuthenticationPrincipal AccountPrincipal p,@PathVariable Long unitId){
        return service.stopServoPreview(p.accountId(),unitId);
    }
}
