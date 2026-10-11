package com.smartaccess.dto;

import com.smartaccess.model.enumtype.*;
import java.time.LocalDateTime;
import java.util.List;

public final class HistoryDtos {
    private HistoryDtos() {}
    public record Reference(Long id, String name) {}
    public record Log(Long id,
            Reference accessUnit,
            Reference device,
            Reference account,
            AccessMethod method,
            AccessResult result,
            String reasonCode,
            LocalDateTime occurredAt) {}
    public record Alert(Long id,
            Reference accessUnit,
            Reference device,
            String eventType,
            EventSeverity severity,
            AlertStatus status,
            String message,
            LocalDateTime occurredAt) {}
    public record PageResponse<T>(List<T> items, int page, int size, long totalElements, boolean hasNext) {}
}
