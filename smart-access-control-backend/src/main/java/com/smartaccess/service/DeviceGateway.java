package com.smartaccess.service;

import java.util.Map;

public interface DeviceGateway {
    void send(String deviceUid, String commandUuid, String commandType, Map<String, Object> data);
}
