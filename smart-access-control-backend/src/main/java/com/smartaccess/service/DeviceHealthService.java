package com.smartaccess.service;

import com.smartaccess.repository.DeviceRepository;
import com.smartaccess.model.enumtype.DeviceType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.util.Map;

@Service
public class DeviceHealthService {
    public record Health(boolean online, LocalDateTime lastSeenAt, LocalDateTime updatedAt, Map<String, String> metrics) {}
    private final ManagerAccessGuard guard;
    private final DeviceRepository devices;
    private final TelemetryService telemetry;
    public DeviceHealthService(ManagerAccessGuard guard, DeviceRepository devices, TelemetryService telemetry) {
        this.guard=guard; this.devices=devices; this.telemetry=telemetry;
    }
    @Transactional(readOnly=true)
    public Health get(Long actor, Long unitId) {
        guard.requireManagedUnit(actor, unitId);
        var device=devices.findFirstByAccessUnit_UnitIdAndDeviceType(unitId, DeviceType.DOOR_CONTROLLER).orElse(null);
        if(device==null) return new Health(false, null, null, Map.of());
        var now=LocalDateTime.now();
        boolean online=device.getLastSeenAt()!=null && device.getLastSeenAt().isAfter(now.minusSeconds(90))
                && !device.getLastSeenAt().isAfter(now.plusSeconds(5));
        var snapshot=telemetry.latest(device.getDeviceId());
        boolean fresh=online && snapshot!=null && snapshot.at().isAfter(now.minusSeconds(90));
        var safe=new java.util.LinkedHashMap<String,String>();
        if(fresh) for(String key:java.util.List.of("wifiSsid","rssi","fingerReady","rfidReady","moduleHealthSupported","doorClosed","doorCalibrated","unlocked")) {
            if(snapshot.values().containsKey(key)) safe.put(key,snapshot.values().get(key));
        }
        return new Health(online,device.getLastSeenAt(),snapshot==null?null:snapshot.at(),safe);
    }
}
