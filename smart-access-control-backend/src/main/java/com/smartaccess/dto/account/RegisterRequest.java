package com.smartaccess.dto.account;

import jakarta.validation.constraints.*;
import java.util.Locale;

public record RegisterRequest(
        @NotBlank @Size(max = 100) String fullName,
        @Email @Size(max = 254) String email,
        @Pattern(regexp = "\\+?[0-9]{8,15}") String phone,
        @NotBlank @Size(min = 8, max = 72) String password) {
    public RegisterRequest {
        fullName = fullName == null ? null : fullName.trim();
        email = email == null || email.isBlank() ? null : email.trim().toLowerCase(Locale.ROOT);
        phone = phone == null || phone.isBlank() ? null : phone.trim();
    }

    @AssertTrue(message = "Email or phone is required")
    public boolean isContactProvided() { return email != null || phone != null; }
}
