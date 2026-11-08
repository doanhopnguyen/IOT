# Còi cảnh báo GPIO5 — firmware 1.14.0 / 2.0.1-demo

## Chức năng

| Điều kiện | Nhịp còi | Dừng khi |
|---|---|---|
| Sai PIN đủ ngưỡng, mặc định **lần thứ 5** | Hai bíp ngắn mỗi giây | Hết khóa nhập PIN 30 giây |
| Cảm biến xác nhận cửa mở liên tục đủ thời gian cài đặt | Một bíp nhắc mỗi 1,5 giây | Cảm biến xác nhận cửa đóng |

PIN trên TFT và bàn phím HX-543 dùng cùng bộ đếm. Chỉ một lượt gửi PIN đủ 6 số mới được xác thực; nhập đúng trước khi bị khóa sẽ xóa số lần sai liên tiếp. PIN quản trị cũng dùng cơ chế giới hạn thử sai hiện có. Cảnh báo bắt đầu **ngay khi chạm ngưỡng**, không đợi lần thứ 6 ở cấu hình mặc định 5.

Cảnh báo mở cửa theo dõi trạng thái vật lý của cảm biến, kể cả cửa mở sẵn lúc thiết bị vừa sẵn sàng hoặc không có lệnh mở khóa trước đó. Đóng cửa sẽ bắt đầu lại một khoảng theo dõi mới cho lần mở tiếp theo. Không tự điều khiển servo từ chức năng còi.

Nếu vừa có sai PIN vừa có cửa mở lâu, nhịp sai PIN được ưu tiên. Đóng cửa không xóa cảnh báo PIN còn trong 30 giây; hết khóa PIN nhưng cửa vẫn mở lâu thì còi tiếp tục theo nhịp cửa mở.

## Cài trong app

Mở **cửa đang sở hữu → Cài đặt thiết bị → Hẹn giờ**:

1. **Cảnh báo khi cửa mở quá:** 10–600 giây, mặc định phía backend 60 giây.
2. **Cảnh báo và khóa PIN sau số lần sai:** 1–10 lần, mặc định 5.
3. Bấm **Lưu cài đặt**.
4. Chờ **Đã đồng bộ** và dòng xác nhận gồm thời gian mở cửa, ngưỡng sai PIN. App chỉ xác nhận khi nhận được các giá trị thiết bị đã báo lại, không chỉ dựa vào lưu thành công trên máy chủ.

Ngưỡng được lưu trên chip để dùng khi mất Wi-Fi/MQTT. Lần thay đổi mới trong app cần thiết bị nối lại để nhận cấu hình. Hạ ngưỡng khi số lần sai hiện tại đã đủ ngưỡng mới sẽ kích hoạt khóa/còi; tăng ngưỡng không hủy một phiên khóa 30 giây đang diễn ra.

Còi không chạy khi chip chưa nhận chủ/chưa hoàn tất thiết lập, đang hiệu chỉnh phần cứng, reset, OTA hoặc có lỗi bộ nhớ. Việc đánh dấu cảnh báo trên app là thao tác xử lý lịch sử; cơ chế còi cục bộ vẫn theo trạng thái cửa và thời gian khóa PIN.

Backend dùng cùng ngưỡng `pinFailureLimit` cho cảnh báo sai PIN trên app. Cảnh báo lịch sử backend giữ quy tắc đếm trong 5 phút; bộ đếm khóa/còi trên cửa dùng số lần sai liên tiếp. Đây là hai khoảng theo dõi khác nhau, không phải lệnh app trực tiếp bật còi.

## Chân điều khiển

**GPIO5**, active-HIGH, không trùng TFT/cảm ứng, RC522, UART vân tay, servo, reed hoặc HX-543 trong sơ đồ hiện tại. Còi chủ động được bật/tắt theo nhịp, không cần chiếm kênh PWM của servo.

Ở lượt thử bàn, người dùng xác nhận nối **còi (+) → GPIO5, còi (−) → GND** và đã nghe tiếng còi. GPIO này vẫn chỉ cung cấp mức 3.3V; lượt thử không đo dòng tiêu thụ hoặc xác nhận khả năng chịu tải lâu dài. Với còi dùng nguồn 5V qua driver, GPIO5 là tín hiệu điều khiển, nguồn driver và ESP32 dùng GND chung; xem [sơ đồ tích hợp](integration.md).

## Phiên bản và các tệp

- Bản chính, nền nút đỏ: **1.14.0**, [firmware-base-1.14.0.bin](../.local/releases/firmware-base-1.14.0.bin).
- Bản demo, nền nút đen: **2.0.1-demo**, [firmware-v2.0.1-demo.bin](../.local/releases/firmware-v2.0.1-demo.bin).
- Admin nhập đúng phiên bản **2.0.1-demo** khi phát hành tệp mới. Không dùng phiên bản 2.0.0-demo cho tệp này; các bản phát hành không được ghi đè.
- Build cả hai: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-ota-demo.ps1`.
- Backend cần migration **V7** (thêm `access_units.pin_failure_limit`) và app cần tải lại source mới. Expo Go: Reload sau khi khởi động dịch vụ; APK cũ cần build lại để có ô cài ngưỡng mới.

## Kiểm thử ngày 08/11/2026

- **360/360** bài backend, gồm MySQL; migration V7 đạt, không skip.
- **86/86** bài app; TypeScript đạt, lint 0 lỗi và 12 cảnh báo có sẵn.
- **18/18** nhóm firmware host. Bài mới chạy trực tiếp `denyPin()`, `expirePinLockout()` và `pollDoorAlarm()` của production với phần cứng giả: ngưỡng 1/3/5/10, nhịp HIGH/LOW, khóa đủ 30 giây, mở/đóng, đổi thời gian đang mở, hai cảnh báo đồng thời, bounce, setup/OTA, lỗi NVS và tràn `millis()`.
- API thật → MQTT thật → telemetry: chủ cửa chỉnh 3/10 lần và 10 giây được đồng bộ; tài khoản khác bị chặn; giá trị ngoài khoảng bị từ chối; telemetry hỏng bị bỏ qua. Thiết bị MQTT của bài này là fixture riêng, đã xóa sau test.
- Giao diện trình duyệt 360/390 px: lưu đúng JSON, chặn ngưỡng 11, đợi cả ngưỡng PIN và thời gian mở cửa được báo lại mới hiện Đã đồng bộ.
- ESP32 COM5 đã phát cả hai mẫu nhịp trên GPIO5, đọc lại **12 chuyển mức, 0 sai lệch**. Người dùng xác nhận **có nghe tiếng còi**. Điều kiện sai PIN/mở cửa của chương trình thử tạm được mô phỏng; chương trình không chạm servo hoặc NVS.
- Đã build bản chính, demo và offline. Bản demo **2.0.1-demo** đã được nạp USB và đọc lại phiên bản/QR; sau đó nạp lại bản chính **1.14.0**.

Sau kiểm thử, giữ nguyên danh tính/QR, cấu hình và dữ liệu trên chip trước lượt sửa này. Chip trước lượt sửa đang chưa có chủ/Wi-Fi/PIN; sau lượt sửa vẫn ở trạng thái đó. Không xóa flash, không nhận thử cửa hoặc làm lại QR. Phần mềm thử còi tạm đã được thay bằng firmware chính.

Bằng chứng: [GPIO thực](../.local/buzzer-20261108/hardware-test.log), [kết quả API/MQTT](../.local/buzzer-20261108/api-result.json), [giao diện cài đặt](../.local/buzzer-20261108/alarm-settings-390.png).
