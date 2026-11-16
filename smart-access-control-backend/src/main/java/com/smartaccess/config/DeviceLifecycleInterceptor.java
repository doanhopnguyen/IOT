package com.smartaccess.config;

import com.smartaccess.model.enumtype.DeviceLifecycleStatus;
import com.smartaccess.model.enumtype.DeviceType;
import com.smartaccess.repository.DeviceRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.HandlerMapping;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.server.ResponseStatusException;
import java.util.Map;
import java.util.Set;
import static org.springframework.http.HttpStatus.CONFLICT;

/** Covers owner mutations, including configuration that is delivered by policy rather than commands. */
@Configuration
public class DeviceLifecycleInterceptor implements WebMvcConfigurer, HandlerInterceptor {
    private final org.springframework.beans.factory.ObjectProvider<DeviceRepository> repositories;
    public DeviceLifecycleInterceptor(org.springframework.beans.factory.ObjectProvider<DeviceRepository> repositories) { this.repositories=repositories; }
    @Override public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(this).addPathPatterns("/api/manager/units/**", "/api/activation/devices/**");
    }
    @Override public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if(Set.of("GET","HEAD","OPTIONS").contains(request.getMethod()) || request.getRequestURI().matches(".*/enrollments/[^/]+/cancel")) return true;
        DeviceRepository devices=repositories.getIfAvailable();
        if(devices==null) return true; // MVC slices may not load persistence; production always has the repository.
        @SuppressWarnings("unchecked")
        var vars=(Map<String,String>)request.getAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE);
        if(vars==null) return true;
        var controller=vars.containsKey("unitId")
                ? devices.findFirstByAccessUnit_UnitIdAndDeviceType(Long.valueOf(vars.get("unitId")), DeviceType.DOOR_CONTROLLER)
                : devices.findByDeviceUid(vars.getOrDefault("uid", ""));
        controller.ifPresent(device -> {
            if(device.getLifecycleStatus()==DeviceLifecycleStatus.SUSPENDED || device.getLifecycleStatus()==DeviceLifecycleStatus.DECOMMISSIONED)
                throw new ResponseStatusException(CONFLICT,"Thiết bị bị tạm ngưng hoặc đã thu hồi; chỉ cho phép xem thông tin");
        });
        return true;
    }
}
