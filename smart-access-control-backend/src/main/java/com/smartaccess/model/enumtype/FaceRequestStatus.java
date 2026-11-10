package com.smartaccess.model.enumtype;

public enum FaceRequestStatus {
    PENDING,
    APPROVED,
    REJECTED,
    COMPLETED,
    /** Chủ tài khoản đã xoá mẫu khuôn mặt sau khi gửi/được duyệt yêu cầu. */
    REVOKED
}
