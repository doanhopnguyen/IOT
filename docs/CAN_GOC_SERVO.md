# Căn góc khóa/mở servo

Áp dụng từ firmware **1.6.0**, cùng bản backend và mobile có chế độ quay thử trực tiếp.

## Chọn đúng hành trình

Phần mềm hỗ trợ **servo vị trí** hành trình 180° hoặc 360°. Với servo bạn mô tả có điểm chặn và dừng tại từng vị trí, chọn 360° nếu đó là hành trình thực tế. Nhãn SG90 có nhiều biến thể; riêng tên SG90 chưa xác định được hành trình hay dải xung của chiếc đang lắp. Nhà sản xuất cũng có [SG90 bản quay liên tục](https://towerpro.com.tw/product/sg90-360-degree-continuous-rotation-servo/); loại đó điều khiển tốc độ/chiều và không dùng cấu hình góc vị trí này.

Góc trên giao diện là góc điều khiển theo hành trình đã chọn. Firmware quy đổi ra xung **1000–2000 µs**, mỗi bước 1° là một giá trị xung riêng, kể cả chế độ 360°. Hành trình và độ chính xác cơ khí thực tế phụ thuộc biến thể servo; quan sát chốt khi căn, đối chiếu thông số servo trước khi mở rộng dải xung. Chưa có cảm biến vị trí chốt nên ACK không phải phép đo góc thực.

## Chỉnh từ app

1. Reload app, chọn cửa do mình quản lý, mở **Thiết lập cửa → Góc servo**. Hoàn tất hiệu chỉnh ban đầu trên chip nếu cửa chưa sẵn sàng.
2. Nếu là servo vị trí 360°, bấm **Đổi hành trình và lưu: 360°**. App quy đổi hai góc hiện có và chờ chip xác nhận lưu. Thao tác đổi hành trình không yêu cầu servo quay.
3. Muốn nhập góc âm, bấm **Dùng góc âm/dương quanh mốc giữa**. Với 360°, `0°` là giữa hành trình (góc điều khiển 180°), `−1°` là 179°, `+1°` là 181°. Với 180°, mốc giữa là 90°. Đổi cách hiển thị không làm servo quay.
4. Để **Quay trực tiếp: BẬT**, nhích `−1°`, `+1°`, `−5°`, `+5°`, hoặc nhập góc nguyên bất kỳ. Nút nhích gửi lệnh ngay; nhập số chờ 350 ms sau ký tự cuối. Khi bấm nhanh, app giữ góc mới nhất chưa gửi, không phát lại toàn bộ các góc cũ. Độ trễ vẫn phụ thuộc kết nối điện thoại → backend → MQTT → ESP32.
5. Đóng cánh cửa trước khi chỉnh/thử **góc khóa**. Quan sát chốt; chỉnh riêng góc khóa và góc mở. Có thể dùng **Thử góc khóa/mở tại góc này** để thử lại mà không thay đổi số.
6. Bấm **Lưu hai góc servo**, đợi chip xác nhận. Các lần mở/khóa tiếp theo dùng hai góc đã lưu, kể cả sau khi khởi động lại. Quay thử trên app chỉ thay đổi bản nháp cho đến khi lưu.
7. Bấm **Dừng quay thử** khi cần. App cũng kết thúc phiên khi rời màn hình hoặc chuyển nền. Nếu mất liên lạc, ESP32 tự kết thúc phiên sau 5 giây không có lệnh; không tự quay về góc cũ. PWM tự ngắt 900 ms sau lệnh gần nhất. Kiểm tra chốt thực tế trước khi dùng lại.

Giới hạn: 180° dùng 5–175° (mốc giữa −85…+85°); 360° dùng 5–355° (mốc giữa −175…+175°). Không quay vòng từ đầu này sang đầu kia qua điểm chặn. Chỉ hỗ trợ góc nguyên, bước nhỏ nhất 1°. Hai góc có thể bằng nhau hoặc đảo thứ tự để phù hợp chiều lắp.

## Chỉnh trực tiếp trên ESP32

- Trong hiệu chỉnh ban đầu, hoặc **ADMIN → SERVO SETUP → GUIDED LOCK / OPEN SETUP**, chọn `RANGE 180/360` theo đúng servo. Đổi hành trình tự quy đổi hai góc, không tự quay.
- Nhích `±1`/`±5` để servo quay ngay; có thể nhích tiếp khi đang quay, đích mới nhất sẽ thay đích cũ. `TEST ... POSITION` thử lại góc hiện tại.
- Đóng cửa, kiểm tra vị trí LOCK rồi chờ hết xung trước khi bấm `CONFIRM LOCK`; chỉnh OPEN, kiểm tra rồi `CONFIRM OPEN / FINISH`. Chip lưu cả hành trình và hai góc sau khi hoàn tất.
- Ở màn hình ADMIN → SERVO SETUP thông thường, các nút nhích cũng quay ngay và lưu từng góc. `TEST OPEN`/`LOCK NOW` kết thúc phiên căn rồi dùng thao tác cửa thông thường.

## Cập nhật phần mềm

```powershell
cd D:\DEV\IOT\smart-access-control-backend
mvn package
cd D:\DEV\IOT\firmware
pio run -c platformio.connected.ini -t upload
cd D:\DEV\IOT
powershell -ExecutionPolicy Bypass -File scripts/start-local.ps1 -Component backend
```

Dừng backend cũ trước khi chạy lại cổng 8080; broker và Metro có thể giữ nguyên. Nếu `pio` không có trong PATH, dùng `C:\Users\ACER\.platformio\penv\Scripts\platformio.exe`. Reload Expo app để nhận giao diện mới.

Firmware nâng cấu hình NVS v1/v2 sang v3 để lưu góc 360° bằng số 16 bit. Giữ PIN, thẻ, danh sách vân tay, hiệu chỉnh cảm ứng/cảm biến và hai góc hiện có; cấu hình cũ mặc định hành trình 180° cho đến khi bạn chọn lại. Không cần erase flash hay reset dữ liệu. Lệnh quay thử quá 3 giây bị bỏ qua; các lệnh servo có thứ tự để lệnh cũ đến muộn không ghi đè góc mới.

## Kết quả kiểm tra ngày 07/11/2026

- Backend `mvn package`: 284 bài, 274 đạt, 10 bài MySQL tùy chọn bỏ qua; không lỗi. Có kiểm thử API/CSRF, góc nguyên 360°, thứ tự lệnh và ACK.
- Mobile: typecheck đạt, 51/51 bài đạt; lint không lỗi, 13 cảnh báo cũ. Bundle Android biên dịch thành công.
- Cả 5 bộ native firmware đạt: offline, setup, factory reset, xóa thành viên, quay thử servo. Kiểm tra cả chuyển cấu hình cũ và xung riêng cho 179°/180°/181° ở hành trình 360°.
- Build connected và offline đạt. Chỉ nạp bản **connected 1.6.0** vào `ESP32-80B54EC8149C` qua COM5; flash được kiểm tra hash.
- Đọc INFO sau nạp: `firmware=1.6.0`, `gen=2`, `wifi=3`, `mqtt=1`, `storageFault=0`, `motorFault=0`, `motorCommanded=0`, `lastServoAngle=-1`. Chip đang `CLAIM`, chưa có PIN/hiệu chỉnh, vì vậy chưa thử mở cửa hay xác nhận hành trình cơ khí trên phần cứng này. Hoàn tất [đăng ký và thiết lập ban đầu](CHAY_TU_DAU_TAILSCALE.md) rồi căn theo hướng dẫn trên.
- Backend đã chạy lại và health báo `READY`; kiểm tra đăng nhập admin, inventory và trang quản trị thành công. Không reset hay xóa dữ liệu cho lần cập nhật này.

Log tại `.local/servo-backend-full.log`, `.local/servo-mobile-tests.log`, `.local/servo-typecheck.log`, `.local/servo-lint.log`, `.local/servo-upload.log`, `.local/servo-offline-build.log`; log backend đang chạy tại `.local/servo-adjustment-20261107/`.

## Khóa từ xa và hẹn giờ

Firmware 1.8.0 dùng các góc đã lưu cho mở, khóa từ xa và tự khóa. App đồng bộ góc hai chiều và giữ riêng bản nháp. Chủ cửa chỉnh thời gian 1–30 giây, chọn chờ cửa đóng hoặc quay về đúng hẹn theo [hướng dẫn khóa và tự động](KHOA_TU_XA_VA_TU_DONG.md).
