# Khóa từ xa, hẹn giờ servo và đồng bộ góc

Đã cập nhật backend, app Expo Go và firmware **1.8.0** cho ESP32-S3. Không cần reset cửa hay cài APK. Reload dự án trong Expo Go; đăng nhập lại sau khi backend khởi động lại.

## Cài thời gian và chế độ tự khóa

Chủ cửa mở cửa cần quản lý → **Cài đặt thiết bị** → phần **Cài đặt cửa từ xa**:

1. Nhập **Tự về góc khóa sau (1–30 giây)**, ví dụ `5`.
2. Bấm **Lưu thời gian**.
3. Chọn **Chờ cánh cửa đóng trước khi khóa**:
   - **Bật:** giữ chốt mở khi cảm biến còn báo cánh cửa mở. Hết thời gian hẹn, khi cửa đóng ổn định ít nhất 1 giây thì servo về góc khóa.
   - **Tắt:** servo về góc khóa đúng thời gian hẹn, kể cả khi cảm biến còn báo mở. Phù hợp mô hình mà servo đưa cửa/chốt về rồi cảm biến mới nhận trạng thái đóng.
4. Chờ dòng **Thiết bị đã xác nhận: … giây · …**. Lưu trên máy chủ và thiết bị xác nhận là hai bước riêng. Nếu chip offline, cài đặt chờ đồng bộ khi chip kết nối lại.

Chế độ mặc định là chờ cửa đóng, giữ cách hoạt động của cửa cũ. Thời gian và chế độ đã nhận được lưu trên ESP32, vẫn dùng khi mất mạng hoặc mất kết nối app. Một lần mở giữ thời gian/chế độ đã chọn tại lúc bắt đầu; thay đổi cài đặt áp dụng cho lần mở tiếp theo. Lệnh khóa mới áp dụng chế độ hiện tại trên thiết bị.

Nếu servo điều khiển chốt gắn vào khung, dùng chế độ chờ cánh cửa đóng để chốt không vướng khung. Nếu cảm biến chỉ báo đóng sau khi servo trở về góc khóa, chọn chế độ quay về đúng hẹn để tránh hai bên chờ nhau.

## Khóa từ app

Ở thẻ cửa hoặc trang chi tiết, bấm **Mở / khóa từ xa**, rồi chọn **Khóa cửa**.

- Chế độ chờ cửa đóng: nếu cửa còn mở, thiết bị xác nhận đã nhận yêu cầu và app hiển thị đang chờ đóng. Khi cảm biến xác nhận đóng ổn định, servo chạy về góc khóa.
- Chế độ quay về đúng hẹn: lệnh khóa từ xa đưa servo về góc khóa ngay; hẹn giờ chỉ áp dụng sau thao tác mở.
- Chỉ tài khoản có quyền điều khiển cửa mới gửi lệnh. Tắt mở từ xa vẫn cho phép người có quyền gửi khóa. Thiết bị phải online, thiết lập xong và không đang reset/hiệu chỉnh.

Thiết bị xác nhận nhận lệnh không đồng nghĩa cánh cửa đã đóng hoặc chốt đã vào khớp. App tiếp tục hiển thị trạng thái cảm biến và chốt riêng.

## Khi nào app báo đã khóa

App cần đồng thời:

1. Cảm biến đã hiệu chỉnh báo cánh cửa đóng.
2. Servo đã hoàn tất xung điều khiển đến góc khóa đang lưu; không còn thao tác chờ/chạy, không lỗi, không hiệu chỉnh.

Nếu servo ở góc khóa nhưng cảm biến báo mở, app vẫn báo chưa khóa. Trong lúc servo chạy, chờ yêu cầu hoặc chưa có lệnh sau reboot, trạng thái chốt là chưa xác nhận. Cảm biến từ gắn trên cánh cửa xác nhận đóng/mở; SG90 không có phản hồi góc. Xác nhận cơ khí rằng chốt đã vào khớp cần cảm biến chốt hoặc servo có phản hồi vị trí.

Trạng thái thay đổi được gửi lên ngay, có giới hạn tần suất; heartbeat định kỳ vẫn được giữ. Vì vậy thao tác mở ngắn cũng được phản ánh sau khi servo hoàn tất.

## Đồng bộ góc

Trong phần góc servo:

- Chỉnh và lưu trên chip: app tự lấy góc mới khoảng mỗi 2 giây.
- Chỉnh trên app: nhích góc vẫn quay thử trực tiếp; bấm **Lưu hai góc servo** để lưu trên chip. Chờ ACK và dữ liệu chip xác nhận.
- Chỉnh bản nháp chưa lưu: dữ liệu chip mới vẫn hiện ở dòng **Góc đang lưu**, ô nhập giữ bản nháp. **Lấy lại góc đang lưu** bỏ bản nháp và dùng góc chip.
- Sau ACK, app chờ heartbeat khớp với góc vừa lưu để tránh dữ liệu cũ ghi đè lại. Nếu quá 15 giây vẫn khác, app báo cần đối chiếu.
- Mở, khóa từ xa và tự khóa đều dùng cùng góc mở/khóa và hành trình đã lưu. Lưu góc tự nó không tạo lệnh mở/khóa.

## Thử trên mô hình

1. Reload Expo Go, đăng nhập, chọn cửa và kiểm tra online/sẵn sàng.
2. Chọn 5 giây và chế độ đúng cơ cấu, chờ thiết bị xác nhận.
3. Bấm mở, theo dõi servo về góc mở rồi tự trở về góc khóa. Với chế độ chờ cửa đóng, đóng cánh cửa trước.
4. Thử khóa từ xa khi cảm biến còn báo mở, kiểm tra thông báo tương ứng với chế độ.
5. Giữ cảm biến báo mở dù servo đã về góc khóa: app phải báo chưa khóa. Đưa cảm biến về đúng vị trí đóng: chỉ khi lệnh servo đã hoàn tất mới báo đã khóa.
6. Đổi góc trên chip và kiểm tra app; sau đó lưu góc từ app, reboot chip và kiểm tra góc được giữ.

Sau nâng cấp/reboot, firmware giữ góc/PIN/thẻ/vân tay nhưng không tự phát lệnh servo chỉ vì vừa khởi động. Bắt đầu bằng một thao tác mở/khóa được xác thực để thử chu kỳ mới.

## Kiểm chứng ngày 07/11/2026

- Backend: 299 bài, 289 đạt, 10 bài MySQL tùy chọn bỏ qua; `mvn package` thành công. Bao gồm quyền khóa, ACK/audit, TTL 10 giây không retained, cập nhật thời gian/chế độ, telemetry và các hồi quy hiện có.
- Mobile: 65/65 bài đạt, typecheck đạt, lint 0 lỗi/12 cảnh báo có sẵn. Android bundle Expo Go chứa điều khiển khóa, chế độ hẹn giờ và đồng bộ góc.
- 9 bộ host test firmware đạt. Hàm motor thật được kiểm tra với phần cứng giả lập; bao gồm cả hai chế độ, hẹn giờ, bộ đếm tràn, cảm biến chưa đóng, lệnh chờ, góc sai, lỗi lưu và tránh di chuyển khi boot.
- Firmware 1.8.0 build/upload thành công, flash kiểm tra hash. Chip giữ PIN, 1 thẻ, 1 vân tay, hiệu chỉnh, generation 2 và góc khóa/mở **5°/245°**, hành trình **360°**.
- MySQL thực áp dụng migration V4; số tài khoản/cửa/credential trước và sau giữ nguyên. Góc, thời gian và chế độ trong telemetry backend khớp chip.
- Sau nạp, INFO xác nhận `motorCommanded=0`, `lastServoAngle=-1`: lần xác minh không tự thử mở/khóa cơ khí. Phần chuyển động thật và phản hồi cảm biến cần thực hiện theo kịch bản trên.

Log và kết quả nằm trong `.local/lock-sync-*`; `.local/lock-sync-result.json` chỉ có thông số và kết quả kiểm tra, không chứa PIN hoặc mật khẩu.
