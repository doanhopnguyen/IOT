package com.smartaccess.controller;
import com.smartaccess.model.Account;
import com.smartaccess.service.*;
import com.smartaccess.exception.BusinessException;
import org.junit.jupiter.api.Test;
import java.util.List;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class AdminUsbControllerTest {
    final CurrentAccountService current=mock(CurrentAccountService.class);
    final UsbDeviceService usb=mock(UsbDeviceService.class);
    final AdminUsbController controller=new AdminUsbController(usb,current);
    @Test void nonAdminCannotEnumerateOrResetUsb(){
        when(current.requireAccount()).thenReturn(new Account());
        assertThatThrownBy(controller::ports).isInstanceOf(BusinessException.class);
        assertThatThrownBy(()->controller.read(new AdminUsbController.Read("COM5"))).isInstanceOf(BusinessException.class);
        verifyNoInteractions(usb);
    }
    @Test void adminCanReadTheSelectedPort(){
        Account admin=new Account();admin.setAdmin(true);when(current.requireAccount()).thenReturn(admin);
        var available=new UsbDeviceService.Available(true,List.of(new UsbDeviceService.Port("COM5","ESP32-S3")));
        when(usb.list()).thenReturn(available);
        var result=new UsbDeviceService.Mac("COM5","80:B5:4E:C8:14:9C","ESP32-S3");when(usb.read("COM5")).thenReturn(result);
        assertThat(controller.ports()).isEqualTo(available);
        assertThat(controller.read(new AdminUsbController.Read("COM5"))).isEqualTo(result);
    }
}
