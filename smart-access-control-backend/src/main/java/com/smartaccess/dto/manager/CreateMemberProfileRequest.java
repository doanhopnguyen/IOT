package com.smartaccess.dto.manager;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** contact là số điện thoại hoặc email, dùng làm tên đăng nhập của tài khoản tối thiểu. */
public record CreateMemberProfileRequest(
        @NotBlank @Size(max = 100) String fullName,
        @NotBlank @Size(max = 254) String contact,
        @Size(max = 50) String room) {
    public CreateMemberProfileRequest {
        fullName = fullName == null ? null : fullName.trim();
        contact = contact == null ? null : contact.trim();
        room = room == null || room.isBlank() ? null : room.trim();
    }
}
