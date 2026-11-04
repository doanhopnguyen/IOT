# Khóa cửa offline ESP32-S3 N16R8

Mã chạy trên ESP32 nằm trong **một file**: [offline_door.ino](offline_door/offline_door.ino). Không cần Wi-Fi, MQTT, backend hay laptop sau khi nạp. Sơ đồ chân theo README(4).md: TFT CS47/DC2/RST1, touch CS48, RFID CS10/RST9, SPI SCK41/MOSI42/MISO21, vân tay RX17/TX18, SG90 GPIO4, cảm biến từ GPIO6–GND. Không dùng buzzer/relay/camera.

## Build và nạp COM5

Tại thư mục `D:\DEV\IOT\firmware`:

```powershell
& "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe" run -c platformio.offline.ini
& "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe" run -c platformio.offline.ini -t upload --upload-port COM5
& "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe" device monitor --port COM5 --baud 115200
```

Đóng Serial Monitor/app đang giữ COM5 trước khi nạp. Nếu USB đổi cổng sau reset thì dùng cổng mới. File cấu hình offline có build riêng, không build `src/main.cpp` của bản kết nối. Arduino IDE cũng mở trực tiếp sketch được; cấu hình board/thư viện ghi đầu file.

Mặc định ST7789 240×320 theo bản đã hiển thị trong README. Nếu phần cứng là ILI9341, đổi `LCD_ILI9341` đầu sketch thành `1`. Vân tay mặc định UART 57600, password module mặc định 0; đổi theo module nếu trước đó đã cấu hình khác.

## Thiết lập lần đầu

1. Cấp đúng nguồn cho từng module; SG90 dùng 5V đủ dòng và chung GND. Thử cơ cấu không tải trước.
2. Giữ ngón tay trên từng dấu cộng rồi nhấc ra. Có ba điểm đo và một điểm giữa để kiểm chứng; nếu sai, màn hình yêu cầu làm lại.
3. Tạo **PIN quản trị 6 số**, nhấn `E`, nhập lại để xác nhận. `C` xóa ô nhập. Không có PIN mặc định.
4. Tạo **PIN mở cửa 6 số** khác PIN quản trị, nhập hai lần.
5. Đóng cửa/đặt nam châm đúng vị trí cửa đóng, nhấn `SAVE CLOSED LEVEL`. Khi cấu hình hoàn tất, servo nhận lệnh khóa nếu cảm biến đang báo cửa đóng.
6. Trong `SERVO SETUP`, chỉnh góc khóa/mở theo cơ cấu bằng bước 5°, dùng `TEST OPEN` / `LOCK NOW` để thử. Mặc định khóa 30°, mở 100°; đây là góc khởi điểm, không đảm bảo khớp mọi cơ cấu.
7. Thêm thẻ và vân tay bằng menu, rồi `EXIT ADMIN` để về màn hình sử dụng.

Nếu mất điện giữa thiết lập, lần sau tiếp tục từ phần còn thiếu. Sau khi đã tạo PIN quản trị, cần PIN này để tiếp tục thiết lập các quyền khác. PIN chỉ lưu salt/hash; dữ liệu NVS chưa mã hóa. NVS riêng `offlinedoor`, không lấy quyền của bản firmware mạng.

## Sử dụng

- Nhập PIN mở cửa rồi `E`, quẹt thẻ được cấp quyền hoặc chạm vân tay được đăng ký tại menu này.
- Mở hợp lệ: servo nhả chốt. Không mở cửa trong 5 giây thì tự khóa; nếu đã mở cửa thì chờ đóng ổn định 1 giây mới khóa. Cửa mở quá 20 giây có nhắc trên màn hình, không đẩy chốt khi cảm biến báo mở.
- Lúc bật nguồn lại: cửa đóng thì phát lệnh khóa; cửa đang mở thì nhả chốt và đợi đóng lại. SG90 nhận PWM khoảng 900 ms rồi nhả lực; cơ cấu phải tự giữ vị trí sau đó.
- `ADMIN` → PIN quản trị: thêm/xóa tối đa **32 thẻ + 32 vân tay**, đổi từng PIN, hiệu chuẩn cảm ứng/cửa, chỉnh góc servo và xem trạng thái. Phiên quản trị hết sau 90 giây không thao tác hoặc tối đa 5 phút.
- `DELETE CARD` / `DELETE FINGER`: chọn UID/ID trong danh sách, dùng `PREV`/`NEXT`, xác nhận `REVOKE ACCESS`. Có thể thu hồi thẻ bị mất mà không cần quẹt lại. Cũng có thể quẹt thẻ/chạm vân tay trên trang xóa để chọn đúng mục.
- Đăng ký vân tay: chạm lần 1, nhấc hẳn, chạm cùng ngón lần 2; timeout 45 giây. Chỉ dùng ô trống được xác nhận qua bitmap, không ghi đè mẫu có sẵn. Mẫu đã có từ firmware cũ không tự được cấp quyền. Có thể xóa mẫu đó tại trang xóa bằng cách chạm đúng ngón tay rồi xác nhận, sau đó đăng ký lại.
- Xóa vân tay thu hồi quyền NVS trước, sau đó mới xóa mẫu trên module. Nếu module lỗi, quyền vẫn bị thu hồi; khi kết nối lại có thể chạm ngón tay tại trang xóa để dọn mẫu còn lại.
- Sai PIN 5 lần thì chặn nhập PIN 30 giây, dùng chung cho PIN cửa/quản trị. Số lần sai lưu qua reset; bật lại trong trạng thái bị chặn sẽ phải chờ lại đủ 30 giây. Thẻ/vân tay hợp lệ vẫn dùng được.
- Lỗi lưu cấu hình sẽ chặn cấp quyền mở mới và báo lỗi. Cảm biến vân tay/RFID lỗi vẫn có thể dùng PIN. `STATUS` → `RETRY MODULES` hoặc Serial `r` thử lại module. Serial `s` xem trạng thái, `t` in tọa độ/áp lực cảm ứng trong 5 giây, `h` xem trợ giúp; không có lệnh Serial bỏ qua PIN.

Chữ trên TFT dùng tiếng Anh/không dấu vì font mặc định Adafruit GFX. Dòng `Latch: LOCK CMD` chỉ biểu thị lệnh gửi servo; cảm biến từ xác nhận cánh cửa, không xác nhận chốt đã khóa thật. Không có nút thoát phía trong trong sơ đồ chân hiện tại; cần cơ cấu mở tay phù hợp. Quên PIN quản trị cần chủ thiết bị xóa flash và thiết lập lại; không có PIN dự phòng.

## Kiểm tra

Host tests (không cần board, cần Python và g++):

```powershell
python firmware/tests/test_offline_door.py
```

Chạy lệnh trên từ gốc repo. Kiểm tra thời gian khóa, không khóa khi cửa mở, đóng/mở lại, tràn `millis()`, lọc danh sách quyền và hiệu chuẩn đảo trục. Task motor chạy riêng mỗi 10 ms nên chờ UART không chặn tự khóa.

Trên phần cứng cần thử: thiết lập ban đầu; mở bằng từng phương thức; từ chối thẻ/ngón chưa đăng ký; thêm/xóa rồi reset kiểm tra quyền còn đúng; nhập sai PIN và reset; cửa mở lâu; đóng/mở lại trong thời gian chờ khóa; hủy/timeout đăng ký vân tay; rút module vân tay trong lúc cửa đang nhả chốt; sụt nguồn khi servo quay. Quan sát màn hình và cơ cấu thực tế để xác nhận góc quay, hiệu chuẩn và nguồn.
