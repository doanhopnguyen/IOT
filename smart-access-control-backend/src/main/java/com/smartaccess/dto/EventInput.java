package com.smartaccess.dto;

import com.smartaccess.model.enumtype.EventSeverity;
import jakarta.validation.constraints.*;
import java.time.LocalDateTime;

public record EventInput(@NotNull @Positive Long deviceId,
        @NotBlank @Pattern(regexp = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}") String eventUuid,
        @NotBlank @Size(max = 50) String eventType,
        @NotNull EventSeverity severity,
        @Size(max = 255) String message,
        @NotNull LocalDateTime occurredAt) {}
