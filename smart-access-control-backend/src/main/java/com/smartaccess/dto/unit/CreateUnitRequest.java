package com.smartaccess.dto.unit;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateUnitRequest(@NotBlank @Size(max = 100) String unitName,
        @NotBlank @Size(max = 64) String deviceCode) {}
