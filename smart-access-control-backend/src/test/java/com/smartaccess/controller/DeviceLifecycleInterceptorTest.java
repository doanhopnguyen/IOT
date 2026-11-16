package com.smartaccess.controller;
import com.smartaccess.config.DeviceLifecycleInterceptor;
import com.smartaccess.model.Device;
import com.smartaccess.model.enumtype.*;
import com.smartaccess.repository.DeviceRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.mock.web.*;
import org.springframework.web.servlet.HandlerMapping;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class DeviceLifecycleInterceptorTest {
    @Test void disabledControllerBlocksEveryOwnerMutationButAllowsInformationAndCancelAndAdminReactivation() {
        var devices=mock(DeviceRepository.class);
        var factory=new StaticListableBeanFactory(Map.of("devices",devices));
        var interceptor=new DeviceLifecycleInterceptor(factory.getBeanProvider(DeviceRepository.class));
        var controller=new Device();
        when(devices.findFirstByAccessUnit_UnitIdAndDeviceType(4L,DeviceType.DOOR_CONTROLLER)).thenReturn(Optional.of(controller));
        for(var state:List.of(DeviceLifecycleStatus.SUSPENDED,DeviceLifecycleStatus.DECOMMISSIONED)) {
            controller.setLifecycleStatus(state);
            for(String path:List.of("unlock","lock","pin","admin-pin","servo","wifi-setup","camera-node/pair","firmware","settings","users/2/fingerprints","users/2/rfids")) {
                var request=request("POST","/api/manager/units/4/"+path);
                assertThatThrownBy(() -> interceptor.preHandle(request,new MockHttpServletResponse(),new Object())).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
            }
            assertThat(interceptor.preHandle(request("GET","/api/manager/units/4/health"),new MockHttpServletResponse(),new Object())).isTrue();
            assertThat(interceptor.preHandle(request("POST","/api/manager/units/4/enrollments/uuid/cancel"),new MockHttpServletResponse(),new Object())).isTrue();
        }
        controller.setLifecycleStatus(DeviceLifecycleStatus.ACTIVE);
        assertThat(interceptor.preHandle(request("POST","/api/manager/units/4/unlock"),new MockHttpServletResponse(),new Object())).isTrue();
    }
    MockHttpServletRequest request(String method,String path) {
        var request=new MockHttpServletRequest(method,path);
        request.setAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE,Map.of("unitId","4"));return request;
    }
}
