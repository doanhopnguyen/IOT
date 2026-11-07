package com.smartaccess.service;

import com.smartaccess.dto.manager.CommandResponse;
import com.smartaccess.exception.BusinessException;
import com.smartaccess.model.Device;
import com.smartaccess.model.enumtype.DeviceLifecycleStatus;
import com.smartaccess.model.enumtype.DeviceType;
import com.smartaccess.repository.DeviceInventoryRepository;
import com.smartaccess.repository.DeviceRepository;
import com.smartaccess.repository.TelemetryRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.util.Map;

@Service
@Transactional
public class OnboardingService {
    public static final String SETUP_CREDENTIALS="SETUP_CREDENTIALS", SETUP_CALIBRATE="SETUP_CALIBRATE", WIFI_SETUP="WIFI_SETUP";
    public static final String SERVO_SET="SERVO_SET", SERVO_PREVIEW="SERVO_PREVIEW", SERVO_PREVIEW_STOP="SERVO_PREVIEW_STOP";
    public record ServoAngles(Integer lockAngle,Integer openAngle,Integer servoRange) {
        public ServoAngles(Integer lockAngle,Integer openAngle){this(lockAngle,openAngle,180);}
    }
    public record Status(boolean online, boolean ready, String stage, boolean doorPinSet, boolean adminPinSet,
                         boolean touchCalibrated, boolean doorCalibrated, String wifiSsid, String deviceUid,
                         boolean servoCalibrated,Integer servoCommandAngle,String servoDirection) {}
    private final ManagerAccessGuard guard;
    private final DeviceRepository devices;
    private final DeviceInventoryRepository inventory;
    private final TelemetryRepository telemetry;
    private final DeviceCommandService commands;
    private final PasswordEncoder passwords;
    public OnboardingService(ManagerAccessGuard guard, DeviceRepository devices, DeviceInventoryRepository inventory,
                             TelemetryRepository telemetry, DeviceCommandService commands, PasswordEncoder passwords) {
        this.guard=guard; this.devices=devices; this.inventory=inventory; this.telemetry=telemetry; this.commands=commands; this.passwords=passwords;
    }
    @Transactional(readOnly=true)
    public Status status(Long actor, Long unitId) {
        guard.requireManagedUnit(actor,unitId);
        Device d=devices.findFirstByAccessUnit_UnitIdAndDeviceType(unitId,DeviceType.DOOR_CONTROLLER)
                .orElseThrow(()->new BusinessException(HttpStatus.NOT_FOUND,"Cửa chưa gắn thiết bị"));
        boolean online=d.getLifecycleStatus()==DeviceLifecycleStatus.ACTIVE && d.getLastSeenAt()!=null
                && d.getLastSeenAt().isAfter(LocalDateTime.now().minusSeconds(90));
        boolean ready=inventory.findById(d.getDeviceId()).map(i->i.isSetupReady() && "ACTIVE".equals(i.getState())).orElse(false);
        return new Status(online,ready,metric(d,"setupStage",ready?"READY":"PINS"),flag(d,"hasDoorPin"),flag(d,"adminPinSet"),
                flag(d,"touchCalibrated"),flag(d,"doorCalibrated"),metric(d,"wifiSsid",""),d.getDeviceUid(),
                flag(d,"servoCalibrated"),angle(d,"servoCommandAngle"),metric(d,"servoDirection","UNKNOWN"));
    }
    public CommandResponse credentials(Long actor,Long unitId,String pin,String confirm,String admin,String adminConfirm) {
        if(pin==null || !pin.matches("\\d{6}") || !pin.equals(confirm) || admin==null || !admin.matches("\\d{6}")
                || !admin.equals(adminConfirm) || pin.equals(admin))
            throw new BusinessException(HttpStatus.BAD_REQUEST,"Hai PIN cần đủ 6 số, xác nhận trùng khớp và khác nhau");
        guard.requireManagedUnit(actor,unitId);
        Device d=guard.requireOnlineController(unitId);
        return CommandResponse.from(commands.dispatch(d,actor,SETUP_CREDENTIALS,
                Map.of("unitId",unitId,"pinHash",passwords.encode(pin),"adminPinHash",passwords.encode(admin)),
                Map.of("pin",pin,"adminPin",admin)));
    }
    public CommandResponse calibrate(Long actor,Long unitId) {
        guard.requireManagedUnit(actor,unitId);
        return CommandResponse.from(commands.dispatch(guard.requireOnlineController(unitId),actor,SETUP_CALIBRATE,
                Map.of("unitId",unitId),Map.of()));
    }
    public CommandResponse wifi(Long actor,Long unitId) {
        guard.requireManagedUnit(actor,unitId);
        return CommandResponse.from(commands.dispatch(guard.requireOnlineController(unitId),actor,WIFI_SETUP,
                Map.of("unitId",unitId),Map.of()));
    }
    @Transactional(readOnly=true)
    public ServoAngles servoAngles(Long actor,Long unitId) {
        guard.requireManagedUnit(actor,unitId);
        Device d=devices.findFirstByAccessUnit_UnitIdAndDeviceType(unitId,DeviceType.DOOR_CONTROLLER)
                .orElseThrow(()->new BusinessException(HttpStatus.NOT_FOUND,"Cửa chưa gắn thiết bị"));
        return new ServoAngles(angle(d,"lockAngle"),angle(d,"openAngle"),"360".equals(metric(d,"servoRange","180"))?360:180);
    }
    public CommandResponse setServoAngles(Long actor,Long unitId,Integer lockAngle,Integer openAngle) {
        return setServoAngles(actor,unitId,lockAngle,openAngle,180);
    }
    public CommandResponse setServoAngles(Long actor,Long unitId,Integer lockAngle,Integer openAngle,Integer servoRange) {
        int range=servoRange==null?servoAngles(actor,unitId).servoRange():servoRange;
        if((range!=180 && range!=360) || lockAngle==null || openAngle==null || lockAngle<5 || lockAngle>range-5 || openAngle<5 || openAngle>range-5)
            throw new BusinessException(HttpStatus.BAD_REQUEST,"Chọn hành trình 180/360 độ và góc nguyên trong giới hạn hành trình");
        guard.requireManagedUnit(actor,unitId);
        Device d=guard.requireOnlineController(unitId);
        return CommandResponse.from(commands.dispatch(d,actor,SERVO_SET,
                Map.of("unitId",unitId,"lockAngle",lockAngle,"openAngle",openAngle,"servoRange",range),
                Map.of("lockAngle",lockAngle,"openAngle",openAngle,"servoRange",range)));
    }
    public CommandResponse previewServo(Long actor,Long unitId,String target,Integer angle) {
        return previewServo(actor,unitId,target,angle,180);
    }
    public CommandResponse previewServo(Long actor,Long unitId,String target,Integer angle,Integer servoRange) {
        int range=servoRange==null?servoAngles(actor,unitId).servoRange():servoRange;
        if((range!=180 && range!=360) || !("LOCK".equals(target) || "OPEN".equals(target)) || angle==null || angle<5 || angle>range-5)
            throw new BusinessException(HttpStatus.BAD_REQUEST,"Chọn vị trí LOCK/OPEN và góc nguyên trong giới hạn hành trình");
        guard.requireManagedUnit(actor,unitId);
        return CommandResponse.from(commands.dispatch(guard.requireOnlineController(unitId),actor,SERVO_PREVIEW,
                Map.of("unitId",unitId,"target",target,"angle",angle,"servoRange",range),Map.of("target",target,"angle",angle,"servoRange",range)));
    }
    public CommandResponse stopServoPreview(Long actor,Long unitId) {
        guard.requireManagedUnit(actor,unitId);
        return CommandResponse.from(commands.dispatch(guard.requireOnlineController(unitId),actor,SERVO_PREVIEW_STOP,
                Map.of("unitId",unitId),Map.of()));
    }
    private Integer angle(Device d,String name) {
        try {int value=Integer.parseInt(metric(d,name,""));return value>=5 && value<=355?value:null;}
        catch(NumberFormatException ignored){return null;}
    }
    private boolean flag(Device d,String metric) {return "true".equals(metric(d,metric,"false"));}
    private String metric(Device d,String name,String fallback) {
        return telemetry.findFirstByDevice_DeviceIdAndMetricNameOrderByOccurredAtDesc(d.getDeviceId(),name)
                .map(t->t.getMetricValue()).orElse(fallback);
    }
}
