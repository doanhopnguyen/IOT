# Firmware ESP32-S3 N16R8

Firmware tích hợp mới, tham khảo dây/sketch trong `D:\BTLIOT`. TFT, touch và RC522 dùng chung hardware SPI với CS riêng; UART vân tay độc lập.

**Bản chính là `connected_door`, cấu hình `platformio.connected.ini`.** Luồng hiện tại: Wi-Fi trước, nhận cửa và đặt hai PIN trong app, sau đó chip hướng dẫn hiệu chỉnh; xem [thiết lập app và Wi-Fi](../docs/THIET_LAP_APP_VA_WIFI.md). `pio run` không chọn cấu hình sẽ build bản legacy `src/main.cpp`, không có luồng mới.

## Build và nạp

1. Cài PlatformIO Core hoặc extension PlatformIO trong VS Code.
2. Chuẩn bị gói cấp phát của đúng chip từ admin, giữ riêng khóa thiết bị và thông tin broker. Bản connected đọc cấu hình cấp phát trong NVS, không đọc `include/smartdoor_config.h` của bản legacy.
3. Với chip đã cấp phát, upload firmware thông thường giữ NVS. Với chip mới, dùng `scripts/device_tool.py provision` theo [hướng dẫn máy phát triển](../docs/HUONG_DAN_MAY_PHAT_TRIEN.md). Không ghi trước Wi-Fi người mua.
4. Đối chiếu [sơ đồ đấu nối](../docs/integration.md). Mặc định ST7789 theo phép thử đầy màn hình; đổi `LCD_ILI9341` theo module thực tế.
5. Chạy trong thư mục `firmware`:

```powershell
pio run -c platformio.connected.ini
pio device list
pio run -c platformio.connected.ini --target upload --upload-port COM5
pio device monitor --port COM5 --baud 115200
```

Thay COM5 bằng cổng thực tế. Chưa cấp phát danh tính vẫn build được nhưng không kết nối MQTT. Build N16R8 dùng flash 16 MB, QIO flash / OPI PSRAM, override board mặc định N8. Phần hành vi màn hình Wi-Fi bên dưới mô tả bản legacy; bản connected dùng portal Wi-Fi và app như tài liệu luồng mới ở trên.

## Hành vi và giới hạn

### Chọn và đổi Wi-Fi trên màn hình

1. Khi chưa có Wi-Fi đã lưu và không có cấu hình mặc định, ESP tự mở màn hình Wi-Fi và quét mạng **2.4 GHz**.
2. Ở màn hình cửa, chạm **WI-FI** góc trên bên phải để đổi mạng bất cứ lúc nào (ngoài lúc đang đăng ký vân tay).
3. Chọn tên mạng, nhập mật khẩu và chạm **CONNECT**. `ABC` / `#+=` / `abc` chuyển chữ hoa, ký tự đặc biệt và chữ thường; `SPACE` nhập dấu cách, `DEL` xóa. Mật khẩu được che, không in Serial.
4. Nếu mạng ẩn, chạm **HIDDEN**, nhập SSID rồi chọn ô **PASSWORD** và nhập mật khẩu. Mạng không mật khẩu để trống ô PASSWORD.
5. Kết nối thành công mới lưu một bản ghi NVS. Nếu sai mật khẩu/không kết nối được trong 20 giây, nhấn CANCEL hoặc ghi bộ nhớ lỗi, thiết bị giữ cấu hình cũ và thử nối lại mạng cũ.
6. Chạm **BACK TO DOOR** để về bàn phím cửa. Bật nguồn lại tự dùng mạng đã lưu; khi Wi-Fi rớt, tự thử nối lại mỗi 15 giây. Không cần sửa code/nạp lại khi đổi Wi-Fi.

Thông tin Wi-Fi được lưu trong namespace NVS `doorwifi`, tách khỏi PIN/quyền/sự kiện. Đây là lưu cấu hình, chưa bật mã hóa flash/NVS. Wi-Fi chọn trên màn hình ưu tiên hơn WIFI_SSID/WIFI_PASSWORD trong file cấu hình. Không thể tự kết nối mạng có mật khẩu nếu chưa được cung cấp mật khẩu. Mạng doanh nghiệp/captive portal chưa hỗ trợ. Khi đổi sang LAN khác, địa chỉ MQTT_HOST cũng phải truy cập được từ LAN đó (Wi-Fi và MQTT là hai cấu hình riêng).

### Xác thực và điều khiển cửa

- RFID và vân tay tự quét; keypad `C` xóa, `E` xác nhận PIN 6 số.
- Snapshot RFID/vân tay lọc theo cửa, quyền phương thức và tài khoản ACTIVE, lưu NVS cho offline. Mẫu có sẵn trên cảm biến không tự được cấp quyền.
- PIN dùng salt ngẫu nhiên + SHA-256 trên ESP32; backend BCrypt. Không log/lưu PIN rõ. 5 lần sai khóa nhập 30 giây trong phiên hiện tại. Đây là mã chung của cửa, không định danh người.
- Lệnh `PIN_SET`, `FP_ENROLL`, `FP_DELETE`, `DOOR_UNLOCK` tương thích backend. Enrollment hai lần quét, timeout 45 giây; đọc bitmap slot trước khi ghi, không đè mẫu cũ.
- Auto-lock chạy trên task riêng kiểm tra mỗi 10 ms, không phụ thuộc chờ MQTT. Boot đưa servo về góc khóa. Chưa có cảm biến để xác nhận chốt đã khóa vật lý.
- Snapshot cập nhật mỗi 10 giây. Xóa flash cần manager đặt lại PIN vì không thể khôi phục PIN rõ từ BCrypt.
- NVS giữ tối đa 63 sự kiện, chỉ xóa sau backend xác nhận đã commit. Hàng đợi đầy/ghi lỗi sẽ chặn mở cục bộ. Giữ 16 kết quả ACK gần nhất, gửi lại tới khi nhận `ack-confirm`; TTL và UUID chống chạy lại lệnh.
- Mất mạng dùng quyền gần nhất. Thu hồi trên backend chỉ hiệu lực sau đồng bộ; đổi board sang cửa khác cần xóa NVS cũ trước khi cấp lại.
- PubSubClient publish QoS 0; sự kiện/ACK được xác nhận và gửi lại ở tầng ứng dụng. Command/config/ACK phải được bảo vệ bằng broker riêng, ACL và TLS khi triển khai. Không dùng broker công khai chung.
- Lệnh cần đồng hồ NTP hợp lệ. Xác thực cục bộ vẫn chạy khi chưa có giờ, sự kiện được đánh dấu chưa đồng bộ thời gian.
- Snapshot tối đa 11 KB JSON; quá giới hạn giữ snapshot cũ. Cần theo dõi khi tăng số người dùng.

Hiệu chuẩn touch mặc định raw 200–3900, đảo X/Y theo tài liệu cũ; cần kiểm tra lại trên board. Nguồn và loại buzzer cần xác nhận. Cảm biến cửa/chốt, nguồn dự phòng, OTA an toàn và BLE provisioning chưa có trong firmware tích hợp; thuộc phần nâng cấp của mô tả.

Tham khảo: [PubSubClient](https://github.com/knolleary/pubsubclient/tree/v2.8), [Adafruit Fingerprint](https://github.com/adafruit/Adafruit-Fingerprint-Sensor-Library), [PlatformIO ESP32-S3](https://docs.platformio.org/en/latest/boards/espressif32/esp32-s3-devkitc-1.html).
