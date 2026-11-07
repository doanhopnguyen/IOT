package com.smartaccess.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.smartaccess.model.Device;
import com.smartaccess.model.enumtype.DeviceLifecycleStatus;
import com.smartaccess.model.enumtype.DeviceType;
import com.smartaccess.repository.DeviceInventoryRepository;
import com.smartaccess.repository.DeviceRepository;
import com.smartaccess.service.DeviceAuthenticationService;
import com.smartaccess.service.FaceEnrollmentService;
import com.smartaccess.service.FaceRecognitionService;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.time.LocalDateTime;

/** Laptop enrollment stays owner-authenticated; runtime uses its scoped camera identity. */
@RestController
@RequestMapping("/api/face-node")
public class FaceNodeRuntimeController {
    public record Connection(String doorCode,String doorName,boolean ready,boolean doorOnline,boolean faceEnabled) {}
    private final DeviceAuthenticationService authentication;
    private final DeviceRepository devices;
    private final DeviceInventoryRepository inventory;
    private final FaceEnrollmentService enrollment;
    private final FaceRecognitionService recognition;
    private final ApplicationEventPublisher notifications;
    public FaceNodeRuntimeController(DeviceAuthenticationService authentication,DeviceRepository devices,DeviceInventoryRepository inventory,
            FaceEnrollmentService enrollment,FaceRecognitionService recognition,ApplicationEventPublisher notifications) {
        this.authentication=authentication;this.devices=devices;this.inventory=inventory;
        this.enrollment=enrollment;this.recognition=recognition;this.notifications=notifications;
    }
    @GetMapping("/connection")
    public Connection connection(@RequestHeader("X-Device-Uid") String uid,@RequestHeader("X-Device-Secret") String secret) {
        Device camera=authentication.authenticate(uid,secret);
        if(camera.getDeviceType()!=DeviceType.FACE_CAMERA_NODE || camera.getAccessUnit()==null)
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        var unit=camera.getAccessUnit();
        var controller=devices.findFirstByAccessUnit_UnitIdAndDeviceType(unit.getUnitId(),DeviceType.DOOR_CONTROLLER);
        boolean ready=controller.flatMap(d->inventory.findById(d.getDeviceId()))
                .map(i->i.isSetupReady() && "ACTIVE".equals(i.getState())).orElse(false);
        boolean online=controller.map(d->d.getLifecycleStatus()==DeviceLifecycleStatus.ACTIVE && d.getLastSeenAt()!=null
                && d.getLastSeenAt().isAfter(LocalDateTime.now().minusSeconds(90))).orElse(false);
        return new Connection(String.format(java.util.Locale.ROOT,"SD-%06d",unit.getUnitId()),unit.getUnitName(),ready,online,unit.isFaceEnabled());
    }
    @PostMapping("/events")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void event(@RequestHeader("X-Device-Uid") String uid,@RequestHeader("X-Device-Secret") String secret,@RequestBody JsonNode event) {
        if(!event.isObject() || event.toString().length()>4096)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Sự kiện nhận diện không hợp lệ");
        enrollment.heartbeat(uid,secret);
        try { recognition.receive(uid,event); }
        catch(IllegalArgumentException exception) {throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Sự kiện nhận diện không hợp lệ");}
        notifications.publishEvent(new com.smartaccess.config.RealtimeConfig.DeviceUpdated());
    }
}
