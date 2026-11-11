package com.smartaccess.service;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartaccess.exception.BusinessException;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class UsbDeviceServiceTest {
    @Test void disabledServiceListsNoPortsAndNeverStartsATool(){
        var service=new UsbDeviceService(new ObjectMapper(),false,"not-a-program","");
        assertThat(service.list().enabled()).isFalse();assertThat(service.list().ports()).isEmpty();
        assertThatThrownBy(()->service.read("COM5")).isInstanceOf(BusinessException.class).hasMessageContaining("chưa bật");
    }
    @Test void flashAndProvisionRejectBadPortsAndDisabledService(){
        var disabled=new UsbDeviceService(new ObjectMapper(),false,"not-a-program","");
        assertThatThrownBy(()->disabled.flash("COM5",new byte[]{1})).isInstanceOf(BusinessException.class).hasMessageContaining("chưa bật");
        assertThatThrownBy(()->disabled.provision("COM5","{}")).isInstanceOf(BusinessException.class).hasMessageContaining("chưa bật");
        var enabled=new UsbDeviceService(new ObjectMapper(),true,"not-a-program","");
        for(String port:new String[]{"COM5 & x","../COM5","COM0"}){
            assertThatThrownBy(()->enabled.flash(port,new byte[]{1})).isInstanceOf(BusinessException.class).hasMessageContaining("không hợp lệ");
            assertThatThrownBy(()->enabled.provision(port,"{}")).isInstanceOf(BusinessException.class).hasMessageContaining("không hợp lệ");
        }
    }
    @Test void chipThatNeverBootsGetsItsOwnMessage(){
        assertThat(UsbDeviceService.message("NO_BOOT")).contains("không khởi động");
    }
    @Test void rejectPathsAndShellSyntaxBeforeStartingAnyProcess(){
        var service=new UsbDeviceService(new ObjectMapper(),true,"not-a-program","");
        for(String port:new String[]{"COM0","COM5 & erase_flash","../COM5","COM5\n","COM99999"})
            assertThatThrownBy(()->service.read(port)).isInstanceOf(BusinessException.class).hasMessageContaining("không hợp lệ");
    }
}
