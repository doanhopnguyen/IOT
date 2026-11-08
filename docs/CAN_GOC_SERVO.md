# Servo cửa demo: hiển thị 0–90°, chỉ mở theo chiều dương

Thang góc trên **app và màn hình TFT của chip** được chỉnh theo quan sát thực tế của cửa demo: mức 180° cũ tương ứng khoảng 90° hành trình, nên app hiển thị tối đa **90°**. Giữ nguyên vị trí khóa **0° ở giữa** đang dùng và cách điều khiển hiện tại; không đổi xung PWM hoặc tự quay servo khi nâng giao diện.

## Dùng trong app

1. Reload app, vào cửa → **Cài đặt thiết bị → Góc Servo**.
2. App hiển thị **Góc mở servo 0–90°**, không còn chọn chiều âm hay nhập góc âm.
3. Nhập góc mở trong 0–90°, hoặc dùng **Giảm 5° / Tăng 5°**. Giảm chỉ đưa góc về gần 0°, không vượt sang giá trị âm. Tăng dừng tại 90°.
4. Để **Quay trực tiếp: BẬT** thì nhích góc gửi lệnh ngay; nhập số gửi sau 350 ms. **Thử khóa 0° / Thử góc mở** thử lại vị trí đang chọn.
5. Bấm **Lưu góc mở**, chờ chip xác nhận. **Dừng quay thử** kết thúc phiên; rời màn hình hoặc chuyển nền cũng kết thúc phiên theo cơ chế hiện có.

Đóng cửa ổn định trước khi thử khóa hoặc đưa góc mở về 0°. Giá trị đã lưu không đổi khi chỉ mở giao diện. Mức 180 cũ hiển thị 90°, mức 90 cũ hiển thị 45°, mức 135 cũ hiển thị 67.5°. App cho nhập bước 0.5° để giữ nguyên các mức lệnh lẻ đã lưu; nút nhích vẫn là 5°.

## Quy đổi và tương thích

| Góc trên app | Giá trị gửi/lưu theo thang lệnh hiện có |
|---|---|
| 0° | 0 |
| 5° | 10 |
| 45° | 90 |
| 67.5° | 135 |
| 90° | 180 |

App nhân đôi góc hiển thị trước khi quay thử/lưu và chia đôi giá trị thiết bị báo khi hiển thị. Luôn gửi chiều dương `openDirection=1`; khóa vẫn gửi `lockAngle=0`, profile lệnh vẫn `servoRange=180`. Backend và firmware giữ nguyên giao thức, NVS và PWM; Từ firmware 1.17.0 / 2.0.4-demo, màn hình TFT cũng chia đôi giá trị lệnh để hiển thị 0–90°, với mỗi lần tăng/giảm 5° tương ứng 10 đơn vị lệnh. Cấu hình cũ không bị ghi lại khi chỉ mở màn hình.

Nếu cửa từng lưu chiều khác, app yêu cầu đóng cửa, nhập góc dương mới rồi lưu. Không tự đổi cấu hình chỉ vì mở màn hình. Wi-Fi, PIN, thẻ, vân tay, thông báo popup và chế độ tạm khóa giữ nguyên.

## Kiểm tra ngày 08/11/2026

- **95/95** bài mobile đạt; typecheck đạt; lint 0 lỗi, 12 cảnh báo có sẵn.
- Kiểm tra quy đổi đủ mọi giá trị lệnh 0–180, kể cả giá trị lẻ, để xem/lưu lại không làm lệch vị trí cũ.
- Giao diện 360/390/768 px: đọc mức 180 thành 90 mà không phát lệnh; giới hạn 0/90, chặn góc âm/ngoài khoảng, bước 5° mới gửi mức 10 cũ; thử khóa gửi đúng 0; lưu 67.5° giữ giá trị 135; chỉ gửi chiều dương.
- API kiểm thử giao diện được giả lập, không phát lệnh quay lên cửa thật. Ảnh, JSON lệnh và log nằm tại `.local/servo-demo90-20261108/`.
## Setup trực tiếp trên chip

Vào ADMIN → SERVO SETUP: tiêu đề `SERVO 0-90 DEG`, khóa cố định 0°, góc mở chỉ dương. `DECREASE 5` / `INCREASE 5` giảm/tăng 5° và dừng tại 0°/90°. Giảm là quay về mốc khóa, không chọn góc âm. `GUIDED LOCK / OPEN SETUP` vẫn yêu cầu TEST rồi CONFIRM riêng cho khóa và mở; góc trên màn hình căn chỉnh, lệnh vừa chạy và trang STATUS dùng cùng thang với app. Giá trị lẻ cũ như 135 hiển thị 67.5°.

Cấu hình âm cũ được đánh dấu `--`, yêu cầu căn chỉnh lại bằng guided setup; không tự đổi chiều hoặc ghi đè khi xem. PWM, giao thức MQTT và NVS v4 giữ nguyên. Góc hiển thị theo profile cửa demo, không phải số đo từ cảm biến vị trí servo.

Kiểm thử bổ sung: 19 bộ native firmware, gồm mã vẽ TFT thật với toàn bộ 181 giá trị lệnh, kiểm tra nút và độ dài chữ; motor task thật xác nhận bước 5° mới tương ứng 10 đơn vị lệnh và giữ các liên động cửa.

Đã build connected 1.17.0, demo 2.0.4-demo và offline; nạp demo qua COM5 ngày 08/11/2026. INFO sau nạp xác nhận firmware 2.0.4-demo, Wi-Fi/MQTT kết nối, giữ openAngle=180 (hiển thị 90°), lockAngle=0, direction=1, NVS v4, 2 vân tay và PIN; không lỗi motor/storage. Boot không phát lệnh servo. Log và bản sao NVS trước nạp ở `.local/servo-tft90-20261108/`; binary và manifest ở `.local/releases/`.
