# Kiểm tra riêng cảm biến vân tay UART

Sketch [fingerprint_test.ino](fingerprint_test.ino) chỉ xác thực giao tiếp, đọc thông số/số mẫu và thử chụp ảnh vào bộ đệm RAM của cảm biến. Không có lệnh đăng ký, xóa mẫu, thay mật khẩu hoặc điều khiển servo.

Đấu theo nhãn trên cảm biến: TX → GPIO17, RX → GPIO18, GND chung. V+ theo module và cấu hình đã thử (3V3 trong sơ đồ dự án). Để trống TCH/VA/D+/D−.

Build: chạy `pio run -c platformio.fingerprint-test.ini` từ thư mục `firmware`. Khi dùng Arduino IDE, mở sketch và cài **Adafruit Fingerprint Sensor Library**. Serial Monitor 115200 baud; gửi `CHECK` kèm xuống dòng để kiểm tra lại. Sketch thử 57600 trước, sau đó các baud phổ biến nếu không có ACK.

Các dòng kết quả:

- `FP_CHECK ... authenticated=1 parameters=0 countStatus=0`: giao tiếp và đọc thông số/số mẫu thành công. `templates` là số mẫu, không phải ID của mẫu.
- `FP_READY`: có thể đặt ngón tay để thử chụp ảnh.
- `FP_IMAGE_CAPTURED`: cảm biến chụp được ảnh; ảnh không được lưu thành mẫu hay gửi ra máy tính.
- `FP_AUTH_FAILED`: cảm biến có trả lời UART nhưng không chấp nhận mật khẩu mặc định; không đổi/xóa dữ liệu để thử.
- `FP_NO_UART_RESPONSE`: chưa nhận được ACK hợp lệ tại các baud đã thử; kiểm tra nguồn, GND và hai dây UART.

Nạp sketch riêng sẽ thay chương trình ứng dụng đang chạy. Sao lưu trước nếu cần giữ chương trình đó và nạp lại firmware cửa sau khi thử. Việc xác thực/chụp ảnh trong bài này không phải một lượt mở cửa và không cấp quyền cho mẫu vân tay.

## Kết quả phần cứng ngày 07/11/2026

Đã chạy bài kiểm tra trực tiếp qua COM5 với TX cảm biến → GPIO17 và RX cảm biến → GPIO18. Cảm biến ACK ở 57600 baud, xác thực mật khẩu mặc định thành công, đọc thông số thành công, dung lượng báo về 300 và số mẫu tại lúc kiểm tra là 1. Lượt kiểm tra có người dùng đặt/nhấc ngón tay đã nhận `FP_FINGER_REMOVED` và `FP_IMAGE_CAPTURED`, xác nhận cảm biến chụp được ảnh vân tay.

Chương trình ứng dụng và vùng NVS/OTA trước thử đã được khôi phục, xác minh digest khớp bản sao lưu. Không đăng ký/xóa mẫu và không phát lệnh servo. Nhật ký và bản sao riêng ở `.local/fingerprint-check/` (không commit).
