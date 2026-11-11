package com.smartaccess.service;

/** Tài khoản MQTT riêng của từng thiết bị (username = UID), tạo/khoá mà không cần khởi động lại broker. */
public interface BrokerAccounts {
    /** Tạo mới hoặc đặt lại mật khẩu; quyền chỉ trong topic của chính UID. */
    void upsertDevice(String uid, String password);
    /** Vô hiệu client, broker ngắt kết nối hiện có. */
    void disableDevice(String uid);
}
