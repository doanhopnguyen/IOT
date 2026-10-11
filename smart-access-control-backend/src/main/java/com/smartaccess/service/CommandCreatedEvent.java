package com.smartaccess.service;

import java.util.Map;

public record CommandCreatedEvent(String commandUuid, String deviceUid,
                                  String commandType, Map<String, Object> wireData) {}
