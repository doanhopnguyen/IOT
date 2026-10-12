package com.smartaccess.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import java.util.Map;

@Component
@Profile("dev")
public class LoggingDeviceGateway implements DeviceGateway {
    private static final Logger log = LoggerFactory.getLogger(LoggingDeviceGateway.class);

    @Override
    public void send(String deviceUid, String commandUuid, String commandType, Map<String, Object> data) {
        // Không in data ra log vì lệnh PIN_SET chứa mã PIN dạng rõ
        log.info("Gửi lệnh {} ({}) tới thiết bị {}", commandType, commandUuid, deviceUid);
    }
}
