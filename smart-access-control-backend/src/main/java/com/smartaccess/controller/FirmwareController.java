package com.smartaccess.controller;

import com.smartaccess.security.AccountPrincipal;
import com.smartaccess.service.FirmwareUpdateService;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
public class FirmwareController {
    public record Install(Long releaseId,boolean consent) {}
    private final FirmwareUpdateService service;
    public FirmwareController(FirmwareUpdateService service){this.service=service;}
    @GetMapping("/api/admin/firmware") public Object list(){return service.list();}
    @PostMapping(value="/api/admin/firmware",consumes="multipart/form-data")
    @ResponseStatus(HttpStatus.CREATED)
    public Object publish(@RequestParam String version,@RequestParam String label,@RequestParam String hardwareVersion,
                          @RequestParam(defaultValue="") String notes,@RequestParam MultipartFile file,
                          @RequestParam(required=false) MultipartFile factoryImage){return service.publish(version,label,hardwareVersion,notes,file,factoryImage);}
    @GetMapping("/api/manager/units/{unitId}/firmware")
    public Object status(@AuthenticationPrincipal AccountPrincipal actor,@PathVariable Long unitId){return service.status(actor.accountId(),unitId);}
    @PostMapping("/api/manager/units/{unitId}/firmware") @ResponseStatus(HttpStatus.ACCEPTED)
    public Object install(@AuthenticationPrincipal AccountPrincipal actor,@PathVariable Long unitId,@RequestBody Install input){
        if(input.releaseId()==null)throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST,"Chọn bản cập nhật");
        return service.install(actor.accountId(),unitId,input.releaseId(),input.consent());
    }
    @GetMapping("/api/device/firmware/{id}/download")
    public ResponseEntity<byte[]> download(@PathVariable Long id,
            @RequestHeader(value="X-Device-Uid",required=false) String uid,@RequestHeader(value="X-Device-Secret",required=false) String secret){
        var r=service.download(uid,secret,id);
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_OCTET_STREAM).cacheControl(CacheControl.noStore())
            .header("X-Content-SHA256",r.getSha256()).header("X-Content-Type-Options","nosniff")
            .contentLength(r.getImageSize()).body(r.getImage());
    }
}
