# Firmware ESP32-S3 N16R8

Firmware tích hợp mới, tham khảo dây/sketch trong `D:\BTLIOT`. TFT, touch và RC522 dùng chung hardware SPI với CS riêng; UART vân tay độc lập.

**Bản chính là `connected_door`, cấu hình `platformio.connected.ini` (firmware 1.11.0).** Luồng hiện tại: Wi-Fi trước, nhận cửa và đặt hai PIN trong app, sau đó chip hướng dẫn hiệu chỉnh; xem [thiết lập app và Wi-Fi](../docs/THIET_LAP_APP_VA_WIFI.md). `pio run` không chọn cấu hình sẽ build bản legacy `src/main.cpp`, không có luồng mới.

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

Thay COM5 bằng cổng thực tế. Chưa cấp phát danh tính vẫn build được nhưng không kết nối MQTT. Build N16R8 dùng flash 16 MB, QIO flash / OPI PSRAM, override board mặc định N8.

## Hành vi và giới hạn

Thiết lập lần đầu: portal chỉ báo hoàn tất sau khi xác nhận đọc lại Wi-Fi đã lưu. Sau thông báo Đã lưu, nhấn/thả RST/EN hoặc ngắt nguồn 5 giây rồi cấp lại; chờ chip online và xác nhận bước này trong app trước khi nhận cửa/đặt PIN. Không giữ BOOT hay reset xuất xưởng. Đã sửa lỗi mạng mở bị gắn `storageFault` vì `Preferences::putString` trả 0 cho mật khẩu rỗng; lỗi NVS thật vẫn chặn báo lưu thành công.

### HX-543 phía trong nhà (1.11.0)

- Dùng cùng PIN mở cửa 6 số đã đặt trong app; `0–9` nhập, `*` xóa toàn bộ, `#` xác nhận. A/B/C/D được bỏ qua. Chỉ nhận ở màn hình HOME sau khi thiết lập xong; menu quản trị và hiệu chỉnh vẫn thao tác trên TFT.
- Chữ số chỉ hiển thị bằng dấu `*`. Sau 15 giây không bấm phím, phần nhập trên HX-543 tự xóa. Chuyển giữa TFT và HX-543 sẽ xóa phần PIN đang nhập dở để không ghép hai lượt nhập.
- Dùng chung `submitPin()` và bộ đếm sai của TFT: 5 lần sai chặn 30 giây; sai PIN gửi sự kiện `PIN/DENIED`, đúng và mở được gửi `PIN/GRANTED`. Giữ phím không tự lặp; bấm nhiều phím cùng lúc xóa lượt nhập và yêu cầu nhả hết.
- Cả hai bàn phím tuân theo cờ bật/tắt PIN trong app, tạm khóa của chủ cửa, tạm ngưng/thu hồi thiết bị, reset và điều kiện sẵn sàng. Cờ bật/tắt PIN lưu NVS để vẫn có hiệu lực sau reboot/mất mạng; PIN quản trị không dùng để mở bằng HX-543.
- Mở qua cùng bộ điều khiển servo và cấu hình tự khóa hiện có. Không cần backend/app mới hay reset NVS để nâng cấp firmware. Xem [hướng dẫn sử dụng và thử trên cửa](../docs/BAN_PHIM_TRONG_NHA.md).

### Wi-Fi của firmware connected 1.4.0

- Khi Wi-Fi rớt, ESP32 lần lượt thử tối đa 5 mạng đã lưu, cách nhau 20 giây; mạng mới được thêm sau khi kết nối thành công. AP SmartDoor phục hồi phát sau khoảng 30 giây mất mạng.
- Điện thoại thường mở captive portal tự động khi kết nối SmartDoor. Nếu hệ điều hành không bật trang, dùng `http://192.168.4.1`.
- Với cửa đã nhận, chạm WI-FI trên bàn phím, nhập PIN admin để vào menu rồi chọn WI-FI. Portal yêu cầu nhập lại PIN admin cho mỗi lần đổi mạng, kể cả khi được mở từ app. Mạng thiết lập ban đầu chưa có PIN nên không hỏi PIN.
- Lỗi kết nối mạng mới sau 35 giây giữ nguyên tối đa 5 mạng cũ và quay lại thử chúng. Hoàn tất Wi-Fi sẽ tắt AP; đổi Wi-Fi không xóa PIN, quyền, thẻ hoặc vân tay.

### Chọn và đổi Wi-Fi trên firmware legacy `src/main.cpp`

Các chi tiết sau chỉ thuộc bản legacy, không áp dụng cho firmware chính `connected_door`:

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
- Auto-lock chạy trên task riêng kiểm tra mỗi 10 ms, không phụ thuộc chờ MQTT. Boot chỉ nạp cấu hình, không tự quay servo. Từ 1.15.0, khóa cố định 0°, góc mở âm/dương theo hành trình 180°; xem [hướng dẫn servo](../docs/CAN_GOC_SERVO.md). Chưa có cảm biến để xác nhận chốt đã khóa vật lý.
- Snapshot cập nhật mỗi 10 giây. Xóa flash cần manager đặt lại PIN vì không thể khôi phục PIN rõ từ BCrypt.
- NVS giữ tối đa 63 sự kiện, chỉ xóa sau backend xác nhận đã commit. Hàng đợi đầy/ghi lỗi sẽ chặn mở cục bộ. Giữ 16 kết quả ACK gần nhất, gửi lại tới khi nhận `ack-confirm`; TTL và UUID chống chạy lại lệnh.
- Mất mạng dùng quyền gần nhất. Thu hồi trên backend chỉ hiệu lực sau đồng bộ; đổi board sang cửa khác cần xóa NVS cũ trước khi cấp lại.
- PubSubClient publish QoS 0; sự kiện/ACK được xác nhận và gửi lại ở tầng ứng dụng. Command/config/ACK phải được bảo vệ bằng broker riêng, ACL và TLS khi triển khai. Không dùng broker công khai chung.
- Lệnh cần đồng hồ NTP hợp lệ. Xác thực cục bộ vẫn chạy khi chưa có giờ, sự kiện được đánh dấu chưa đồng bộ thời gian.
- Snapshot tối đa 11 KB JSON; quá giới hạn giữ snapshot cũ. Cần theo dõi khi tăng số người dùng.

Hiệu chuẩn touch mặc định raw 200–3900, đảo X/Y theo tài liệu cũ; cần kiểm tra lại trên board. Nguồn và loại buzzer cần xác nhận. Cảm biến cửa/chốt, nguồn dự phòng, OTA an toàn và BLE provisioning chưa có trong firmware tích hợp; thuộc phần nâng cấp của mô tả.

Tham khảo: [PubSubClient](https://github.com/knolleary/pubsubclient/tree/v2.8), [Adafruit Fingerprint](https://github.com/adafruit/Adafruit-Fingerprint-Sensor-Library), [PlatformIO ESP32-S3](https://docs.platformio.org/en/latest/boards/espressif32/esp32-s3-devkitc-1.html).

- Từ 1.17.0 / 2.0.4-demo, setup servo trên TFT đồng bộ app: 0–90°, khóa 0°, chỉ dương, tăng/giảm 5° hiển thị = 10 đơn vị lệnh. Giữ PWM/NVS/MQTT và các vị trí đã lưu; 180 cũ hiển thị 90°.

- Từ 1.18.0 / 2.0.5-demo, DOOR_LOCK từ app đưa servo về góc khóa ngay, không chờ cảm biến. Tự khóa và thao tác khóa tại TFT vẫn giữ chính sách hiện tại. Không thay đổi PWM hoặc NVS.


- Từ 2.0.6-demo, bản OTA không bật cờ nền nút đen nên nút trở về nền mặc định (xanh dương trên chip thật).

- Từ 2.0.7-demo, bản OTA bật lại nền nút đen (FW_DEMO_BLACK_BUTTONS), cùng chức năng với 1.18.0. Build bằng môi trường esp32-s3-ota-black trong platformio.connected.ini.