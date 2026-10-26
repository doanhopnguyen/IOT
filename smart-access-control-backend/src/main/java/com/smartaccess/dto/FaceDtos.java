package com.smartaccess.dto;

import jakarta.validation.constraints.*;
import java.time.LocalDateTime;
import java.util.List;

public final class FaceDtos {
    private FaceDtos() { }
    public record CreateRequest(@NotNull @Positive Long unitId, @Positive Long accountId, @AssertTrue boolean consent,
                                @NotBlank String model, @NotNull @Size(min = 512, max = 512) List<@NotNull Float> embedding) { }
    public record Decision(boolean approved) { }
    public record RequestView(Long id, Long accountId, String accountName, Long unitId, String unitName,
                              String status, LocalDateTime requestedAt) { }
    public record Profile(boolean hasTemplate, Long credentialId, String model) { }
    public record Template(Long credentialId, Long accountId, List<Float> embedding) { }
    public record Templates(String model, List<Template> templates) { }
}
