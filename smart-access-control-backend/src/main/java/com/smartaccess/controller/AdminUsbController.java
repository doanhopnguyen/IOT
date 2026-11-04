package com.smartaccess.controller;
import com.smartaccess.exception.BusinessException;
import com.smartaccess.service.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.web.bind.annotation.*;
import static org.springframework.http.HttpStatus.FORBIDDEN;

@RestController @RequestMapping("/api/admin/usb")
public class AdminUsbController {
    public record Read(@NotBlank @Pattern(regexp="(?i)COM[1-9][0-9]{0,3}") String port){}
    private final UsbDeviceService usb;private final CurrentAccountService current;
    public AdminUsbController(UsbDeviceService usb,CurrentAccountService current){this.usb=usb;this.current=current;}
    private void admin(){if(!current.requireAccount().isAdmin())throw new BusinessException(FORBIDDEN,"Chỉ admin được đọc USB máy chủ");}
    @GetMapping("/ports") public UsbDeviceService.Available ports(){admin();return usb.list();}
    @PostMapping("/read-mac") public UsbDeviceService.Mac read(@Valid @RequestBody Read input){admin();return usb.read(input.port());}
}
