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
5. Hiệu chỉnh cảm biến theo hướng dẫn: xác nhận khi cửa đóng rồi khi cửa mở. Tiếp theo là SERVO LOCK / SERVO OPEN: đóng cửa, chỉnh góc khóa, TEST rồi CONFIRM LOCK; chỉnh góc mở, TEST rồi CONFIRM OPEN / FINISH. Chỉ nút TEST mới quay servo; phải đợi xung thử kết thúc và quan sát chốt trước khi xác nhận. Hai góc được lưu thành cặp sau bước cuối; góc lệnh và dấu tăng/giảm được hiển thị, không phải số đo vị trí thực.
6. Trong `SERVO SETUP`, chọn `GUIDED LOCK / OPEN SETUP`, dùng `RANGE 180/360` theo hành trình servo vị trí đang lắp. Nhích `±1°`/`±5°` sẽ quay ngay; quan sát chốt rồi xác nhận LOCK và OPEN để lưu cả cặp. Các nút nhích ở màn hình SERVO SETUP thông thường cũng quay ngay và lưu từng góc; `TEST OPEN` / `LOCK NOW` dùng thao tác cửa bình thường. Hai góc có thể bằng nhau và được giữ sau reboot. Mặc định khóa 100°, mở 30°, hành trình 180°. Cấu hình v1/v2 được nâng sang v3 với góc 16 bit, giữ PIN/thẻ/vân tay/hiệu chỉnh; v1 dùng mặc định 100°/30°, v2 giữ góc đã chỉnh. Firmware cũ không đọc được cấu hình v3. Xem [hướng dẫn căn góc](../docs/CAN_GOC_SERVO.md).
7. Thêm thẻ và vân tay bằng menu, rồi `EXIT ADMIN` để về màn hình sử dụng.

Nếu mất điện giữa thiết lập, lần sau tiếp tục từ phần còn thiếu. Sau khi đã tạo PIN quản trị, cần PIN này để tiếp tục thiết lập các quyền khác. PIN chỉ lưu salt/hash; dữ liệu NVS chưa mã hóa. NVS riêng `offlinedoor`, không lấy quyền của bản firmware mạng.

## Sử dụng

- HX-543 phía trong nhà đã tích hợp cùng PIN mở cửa: `0–9` nhập, `*` xóa, `#` xác nhận, A/B/C/D bỏ qua; chỉ hoạt động ở HOME. Hàng dùng GPIO7/8/11/12; cột dùng GPIO13/14/15/38. Dùng chung giới hạn PIN sai với TFT; phần nhập tự xóa sau 15 giây hoặc khi chuyển sang nhập trên TFT. Thư viện Arduino IDE cần thêm **Keypad (Mark Stanley/Alexander Brevig)**; PlatformIO tự cài theo cấu hình.
- Nhập PIN mở cửa rồi `E`, quẹt thẻ được cấp quyền hoặc chạm vân tay được đăng ký tại menu này.
- Mở hợp lệ: servo nhả chốt. Không mở cửa trong 5 giây thì tự khóa; nếu đã mở cửa thì chờ đóng ổn định 1 giây mới khóa. Cửa mở quá 20 giây có nhắc trên màn hình, không đẩy chốt khi cảm biến báo mở.
- Lúc bật nguồn lại hoặc hoàn tất thiết lập: không phát lệnh xoay servo. Đóng/mở cánh cửa khi chưa có lượt mở hợp lệ cũng không làm servo xoay. Dùng mở cửa hợp lệ hoặc `LOCK NOW` để điều khiển; trước lệnh đầu tiên màn hình báo `Latch:UNKNOWN`. SG90 nhận PWM khoảng 900 ms mỗi lệnh rồi nhả lực; cơ cấu phải tự giữ vị trí sau đó.
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
