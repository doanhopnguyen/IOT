package com.smartaccess.dto.account;

import jakarta.validation.constraints.*;
import java.util.Locale;

/** Omitted/null fields stay unchanged; an empty contact string explicitly clears that contact. */
public record UpdateProfileRequest(@Size(min = 1, max = 100) String fullName,
        @Email @Size(max = 254) String email,
        @Pattern(regexp = "(?:|\\+?[0-9]{8,15})") String phone) {
    public UpdateProfileRequest {
        fullName = fullName == null ? null : fullName.trim();
        email = email == null ? null : email.trim().toLowerCase(Locale.ROOT);
        phone = phone == null ? null : phone.trim();
    }

    @AssertTrue(message = "At least one profile field is required")
    public boolean isNotEmpty() { return fullName != null || email != null || phone != null; }
}
