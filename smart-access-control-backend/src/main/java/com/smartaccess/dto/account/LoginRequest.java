package com.smartaccess.dto.account;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record LoginRequest(@NotBlank @Size(max = 254) String identifier,
        @NotBlank @Size(max = 72) String password) {
    public LoginRequest { identifier = identifier == null ? null : identifier.trim(); }
}
