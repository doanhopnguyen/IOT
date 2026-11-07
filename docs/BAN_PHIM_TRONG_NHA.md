# Bàn phím HX-543 phía trong nhà

Firmware **connected 1.11.0** đã tích hợp bàn phím rời vào chức năng mở cửa hiện có. Bản offline dùng chung phần xử lý. Sơ đồ cáp đã chạy bằng sketch thử riêng; việc mở cửa thực tế bằng firmware tích hợp vẫn cần kiểm tra sau khi nạp.

## Đấu nối

Nhìn từ mặt phím, cáp hướng xuống: chân 1 bên phải cạnh chấm trắng, chân 8 bên trái. Tắt nguồn khi thay dây.

| Chân HX-543 | Nhóm phím | GPIO ESP32-S3 |
|---|---|---|
| 1 | Cột 4: A/B/C/D | 38 |
| 2 | Cột 3: 3/6/9/# | 15 |
| 3 | Cột 2: 2/5/8/0 | 14 |
| 4 | Cột 1: 1/4/7/* | 13 |
| 5 | Hàng 4: */0/#/D | 12 |
| 6 | Hàng 3: 7/8/9/C | 11 |
| 7 | Hàng 2: 4/5/6/B | 8 |
| 8 | Hàng 1: 1/2/3/A | 7 |

Bàn phím thụ động không cần VCC/3V3/5V/GND. Không chuyển sang GPIO35/36/37 của N16R8 vì liên quan PSRAM; GPIO43/44 là đường UART. Trong firmware, thứ tự hàng trên xuống là `{7,8,11,12}`, cột trái sang phải là `{13,14,15,38}`. Các cảm biến khác theo [sơ đồ tích hợp](integration.md).

Để khớp UART vân tay trong firmware, đấu chéo: **TX cảm biến → GPIO17 (RX ESP32)**, **RX cảm biến → GPIO18 (TX ESP32)** và GND chung. GPIO16 không được khai báo cho UART vân tay. Nguồn cảm biến theo module thực tế và sơ đồ phần cứng đã thử.

## Sử dụng

1. Hoàn tất thiết lập cửa trong app và hiệu chỉnh. Đưa TFT về HOME (màn hình nhập PIN sử dụng bình thường).
2. Nhập **PIN mở cửa 6 số** đang có hiệu lực trên chip, rồi nhấn `#`. Đây là PIN cửa đã đặt trong app, không phải PIN quản trị.
3. Nhấn `*` để xóa toàn bộ phần vừa nhập. A/B/C/D được bỏ qua. Đủ 6 số chưa tự mở; cần nhấn `#`. Chữ số chỉ được hiển thị dưới dạng `*`, không in PIN vào Serial/MQTT.
4. Sau khi mở, servo dùng đúng góc, thời gian mở và chế độ chờ cửa đóng đã lưu. Cảm biến cửa và task tự khóa hoạt động như lượt mở bằng TFT/thẻ/vân tay.

HX-543 chỉ nhập PIN cửa ở HOME; không điều khiển menu ADMIN, thiết lập Wi-Fi, đăng ký thẻ/vân tay hoặc hiệu chỉnh servo. Khi TFT đang ở các trang đó, nhả phím HX-543 rồi trở về HOME trước khi nhập mã.

Sau 15 giây không có phím mới, phần PIN đang nhập bằng HX-543 tự xóa. Bắt đầu nhập trên TFT sẽ xóa phần đang nhập ở HX-543 và ngược lại; không ghép các mảnh mã từ trong và ngoài nhà. Phím giữ không tự lặp. Khi nhận nhiều phím cùng lúc, lượt nhập bị xóa; nhả hết rồi nhập lại từng phím.

## Quyền, offline và lịch sử

- Hai bàn phím dùng chung PIN cửa và bộ đếm sai với PIN quản trị hiện có. Sai 5 lần chặn nhập 30 giây; bộ đếm lưu NVS nên reboot không bỏ giới hạn này. Mã thiếu 6 số không tính là một lần sai.
- Trong app, tắt phương thức PIN sẽ chặn mở bằng PIN ở cả TFT và HX-543 sau khi chip nhận cấu hình. Cờ này lưu NVS và tiếp tục có hiệu lực khi mất mạng/khởi động lại. Bật lại PIN cũng cần chip nhận cấu hình mới.
- Khi chủ cửa tạm khóa (LOCKDOWN), PIN chung bị chặn theo quy tắc hiện có; khi admin tạm ngưng (SUSPENDED) hoặc thu hồi (RETIRED), keypad không mở được cửa. Reset, chưa thiết lập xong, lỗi lưu trữ hoặc lỗi/hiệu chỉnh motor cũng chặn thao tác.
- Sau khi thiết lập hoàn tất, mất Wi-Fi/backend không chặn xác thực PIN cục bộ; áp dụng cấu hình đã lưu gần nhất. Khôi phục mạng sẽ gửi bù lịch sử.
- Lịch sử dùng phương thức `PIN` hiện có: mã sai hợp lệ gửi `DENIED`, mã đúng và motor chấp nhận mở gửi `GRANTED`. Bấm phím trong thời gian chặn hoặc khi phương thức PIN bị tắt/hạn chế không tạo thêm lượt sai. PIN dùng chung không xác định người nào nhập; lịch sử hiện chưa phân biệt phía trong/phía ngoài hay chiều ra/vào.

## Build và nạp

Trong thư mục `firmware`:

```powershell
& "$env:USERPROFILE\.platformio\penv\Scripts\platformio.exe" run -c platformio.connected.ini
& "$env:USERPROFILE\.platformio\penv\Scripts\platformio.exe" run -c platformio.connected.ini -t upload --upload-port COM5
```

Đổi COM5 theo cổng thực tế, đóng Serial Monitor đang giữ cổng trước khi nạp. Nạp cập nhật firmware thông thường giữ NVS/PIN/thẻ/vân tay/hiệu chỉnh và danh tính thiết bị; không chạy erase flash hoặc factory reset chỉ để thêm keypad. PlatformIO tự cài `Keypad@3.1.1`. Bản legacy `src/main.cpp` không tích hợp HX-543; phải chọn `platformio.connected.ini`.

## Kiểm tra trên cửa sau khi nạp

Kiểm chứng phần mềm: cả `platformio.connected.ini` và `platformio.offline.ini` build thành công; các script host test trong `firmware/tests` đạt, gồm kiểm tra keypad/PIN và các luồng motor/setup/reset/thu hồi. Bài keypad biên dịch trực tiếp các hàm nhập/xác thực từ firmware với phần cứng giả, không gửi lệnh lên ESP32.

1. Kiểm tra chip báo firmware 1.11.0 và thiết lập READY, không tự quay servo khi boot.
2. Tại HOME, nhập PIN cửa + `#` từ HX-543: mở đúng góc; kiểm tra chu kỳ tự khóa theo cài đặt. Kiểm tra TFT, RFID và vân tay vẫn dùng được.
3. Thử `*`, mã thiếu, để quá 15 giây, giữ phím và bấm đồng thời. Các thao tác này không được mở cửa ngoài ý muốn.
4. Thử tổng cộng 5 PIN sai xen kẽ TFT/HX-543: cả hai bị chặn 30 giây. Kiểm tra lịch sử/cảnh báo sai PIN trên app sau đồng bộ.
5. Tắt PIN trong app, chờ chip nhận: cả hai bàn phím không mở bằng PIN; reboot/ngắt Wi-Fi và thử lại. Bật PIN, chờ chip nhận rồi thử mã đúng.
6. Thử các trạng thái tạm khóa/tạm ngưng theo quyền hiện có và xác nhận keypad không bỏ qua hạn chế. Thu hồi thiết bị là thao tác xóa dữ liệu vĩnh viễn nên chỉ thử trên thiết bị chuyên kiểm thử.
7. Khi cửa đã READY, ngắt Wi-Fi, mở bằng keypad rồi nối mạng lại và đối chiếu lịch sử `PIN`.

Các bài host test và build xác minh phần mềm; chưa thay cho kết quả kiểm tra dây, nguồn, cảm biến và chốt trên cửa thật.
