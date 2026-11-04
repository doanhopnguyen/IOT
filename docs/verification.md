# Kết quả kiểm tra phần mềm — 03/11/2026

| Kiểm tra | Kết quả |
|---|---|
| `mvn test` | 181 bài: 171 đạt, 10 bài MySQL thực bỏ qua, 0 failure/error; BUILD SUCCESS |
| `npm run typecheck` | Đạt |
| `npm test` (mobile) | 17/17 đạt |
| `npm run lint` | 0 lỗi, 9 cảnh báo |
| `python -m unittest discover -s tests` (face-node) | 9/9 đạt |
| `pio run` (ESP32-S3 N16R8, ST7789) | SUCCESS; firmware.bin 932320 byte |
| `git diff --check` | Không có lỗi whitespace |

Các bài bổ sung kiểm tra MQTT secret/topic/retained/type, lọc quyền cục bộ, sự kiện offline chống trùng/giữ timestamp, quyền remote của thành viên, thu hồi session WebSocket và cấp/đổi/thu hồi secret thiết bị.

Lint đã được thiết lập cho project vốn chưa có cấu hình. Chẩn đoán React Compiler về reset state trong effect và sửa ref được giữ ở mức cảnh báo vì chưa bật compiler; ngoài ra có cảnh báo require import trong uploadService cũ. Không coi đây là đã sửa toàn bộ cảnh báo.

Ở lượt kiểm thử tự động ban đầu, firmware được build với cấu hình mẫu. Sau đó đã cấp phát và chạy tích hợp thực tế theo phần cập nhật bên dưới; chưa kiểm tra đầy đủ dây/nguồn/servo/cảm biến và các tình huống lỗi trên phần cứng.

## Bổ sung Wi-Fi trên TFT

Firmware đã được biên dịch lại thành công sau khi bổ sung WifiSettings: quét bất đồng bộ, bàn phím chữ thường/hoa/ký tự đặc biệt, SSID ẩn, lưu NVS sau kết nối thành công, khôi phục mạng cũ khi timeout/hủy/lỗi lưu và tự reconnect. Các dòng kiểm thử backend/mobile ở trên thuộc lượt tích hợp trước; phần bổ sung này chỉ thay firmware và tài liệu.

Cần thử trên ESP32: lần đầu không có cấu hình; kết nối đúng/sai mật khẩu; reboot khi đã lưu; mất Wi-Fi rồi có lại; SSID ẩn; mật khẩu có dấu cách/ký tự đặc biệt; hủy kết nối mới; mất nguồn trong lúc đổi mạng. Xác nhận auto-lock và xác thực RFID/vân tay vẫn chạy trong khi quét/đổi Wi-Fi. Chưa xác minh các tình huống này trên phần cứng.

## Cập nhật sau khi cấp phát môi trường và nạp board

- Đã xác nhận board COM6 là ESP32-S3, flash16MB/PSRAM8MB; nạp firmware thành công và kiểm tra hash flash.
- Đã tạo database/user MySQL riêng; Flyway chạy thành công, backend kết nối được bằng user mới.
- Đã tạo admin ứng dụng, cửa và hai thiết bị; kiểm tra login session/CSRF và API không trả secret thiết bị.
- Broker riêng port1884 xác thực ba tài khoản; không thay broker hệ thống port1883.
- Người dùng xác nhận màn hình Wi-Fi Connected and saved. Backend đã nhận heartbeat ESP32 ACTIVE.
- Expo phục vụ HTML và bundle JavaScript HTTP200. Model Face AI đã tải và khớp checksum; webcam node đã ACTIVE, sau đó dừng theo yêu cầu người dùng.
- Chưa cấp credential/PIN cho tài khoản mới, chưa thử lệnh mở servo hoặc chứng minh đầy đủ offline/mất điện trên phần cứng. Các phép thử MySQL cục bộ trên không đồng nghĩa đã chạy lại10 integration test từng được bỏ qua trong suite tự động.
