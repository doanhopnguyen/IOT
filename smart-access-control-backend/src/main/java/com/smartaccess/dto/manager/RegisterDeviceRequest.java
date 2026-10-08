package com.smartaccess.dto.manager;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RegisterDeviceRequest(@NotBlank @Size(max = 64) String deviceCode) {}
