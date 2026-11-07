package com.smartaccess.dto.manager;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Hồ sơ chỉ dùng tại cửa cho người chưa có ứng dụng: chỉ cần họ tên, phòng không bắt buộc. */
public record CreateMemberProfileRequest(
        @NotBlank @Size(max = 100) String fullName,
        @Size(max = 50) String room) {
    public CreateMemberProfileRequest {
        fullName = fullName == null ? null : fullName.trim();
        room = room == null || room.isBlank() ? null : room.trim();
    }
}
