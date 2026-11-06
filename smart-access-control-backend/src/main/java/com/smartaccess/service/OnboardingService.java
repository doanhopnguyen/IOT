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
    public static final String SERVO_SET="SERVO_SET";
    public record ServoAngles(Integer lockAngle,Integer openAngle) {}
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
        return new ServoAngles(angle(d,"lockAngle"),angle(d,"openAngle"));
    }
    public CommandResponse setServoAngles(Long actor,Long unitId,Integer lockAngle,Integer openAngle) {
        if(lockAngle==null || openAngle==null || lockAngle<5 || lockAngle>175 || openAngle<5 || openAngle>175)
            throw new BusinessException(HttpStatus.BAD_REQUEST,"Góc khóa và mở cần là số nguyên từ 5 đến 175 độ");
        guard.requireManagedUnit(actor,unitId);
        Device d=guard.requireOnlineController(unitId);
        return CommandResponse.from(commands.dispatch(d,actor,SERVO_SET,
                Map.of("unitId",unitId,"lockAngle",lockAngle,"openAngle",openAngle),
                Map.of("lockAngle",lockAngle,"openAngle",openAngle)));
    }
    private Integer angle(Device d,String name) {
        try {int value=Integer.parseInt(metric(d,name,""));return value>=5 && value<=175?value:null;}
        catch(NumberFormatException ignored){return null;}
    }
    private boolean flag(Device d,String metric) {return "true".equals(metric(d,metric,"false"));}
    private String metric(Device d,String name,String fallback) {
        return telemetry.findFirstByDevice_DeviceIdAndMetricNameOrderByOccurredAtDesc(d.getDeviceId(),name)
                .map(t->t.getMetricValue()).orElse(fallback);
    }
}
