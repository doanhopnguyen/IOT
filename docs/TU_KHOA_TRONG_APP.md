# Chọn chế độ tự khóa trong app

Vào Cài đặt thiết bị → Tự khóa, chọn một trong hai chế độ rồi bấm **Lưu cài đặt**:

- **Tự quay về góc khóa**: hiện ô thời gian 1–30 giây. Servo về góc khóa khi hết thời gian, kể cả khi cảm biến vẫn báo cửa mở.
- **Chờ cửa đóng rồi khóa**: ẩn ô thời gian. Cảm biến phải xác nhận đóng cửa trước khi servo khóa; giữ cơ chế xác nhận cửa đóng ổn định của firmware hiện có.

Lựa chọn chờ cảm biến được chuyển khỏi trang Phương thức mở cửa để nằm cùng phần tự khóa. Chỉ chọn chế độ chưa gửi lệnh hay đổi cài đặt cửa; bấm Lưu gửi chế độ và các giá trị hiện trên màn hình trong cùng yêu cầu. Đổi qua lại hai lựa chọn giữ nội dung ô thời gian. Khi lưu chế độ cảm biến, app không gửi hoặc kiểm tra ô thời gian ẩn và giữ giá trị đã lưu để dùng khi chuyển lại chế độ hẹn giờ.

Nhãn Chưa lưu thể hiện bản nháp; Đã đồng bộ chỉ xuất hiện khi cấu hình đã lưu khớp telemetry của chip. Phần xác nhận hiển thị đúng chế độ cửa báo về. Backend và firmware hiện tại đã hỗ trợ autoLockWaitForClose, không cần thay đổi giao thức hoặc nạp chip cho chỉnh sửa giao diện này. Chế độ cảm biến vẫn giữ thời gian chờ vào cửa của firmware trước khi tự trả khóa nếu người dùng chưa mở cánh cửa.

Kiểm thử: 97 bài mobile, TypeScript và lint (0 lỗi, 12 cảnh báo có sẵn); kiểm tra giao diện 360/390/768 px với API giả lập, bao gồm lưu hai chế độ, ẩn/hiện thời gian, chặn thời gian ngoài khoảng và giữ thời gian cũ khi lưu chế độ cảm biến. Không gửi lệnh tới cửa thật. Ảnh và yêu cầu PATCH ở .local/auto-lock-modes-20261108/.

## Khóa từ xa theo yêu cầu

Từ firmware 1.18.0 / 2.0.5-demo, bấm khóa cửa từ app gửi DOOR_LOCK và yêu cầu servo quay về góc khóa 0° ngay, kể cả khi cảm biến đang báo cửa mở. Thao tác này hủy trạng thái mở/lệnh khóa chờ hiện có và không thay đổi chế độ tự khóa đã lưu. Lần mở tiếp theo vẫn áp dụng chế độ hẹn giờ hoặc chờ cảm biến như đã chọn. Các điều kiện thiết bị sẵn sàng, lỗi motor, lỗi lưu trữ và phiên căn góc vẫn được kiểm tra. ACK LOCK_COMMAND xác nhận đã tiếp nhận lệnh servo, không phải xác nhận cơ khí rằng cánh cửa/chốt đã đóng.

Remote-lock regression: 19 bộ kiểm thử native firmware đều đạt; connected, demo và offline build thành công. Đã nạp 2.0.5-demo qua COM5 ngày 08/11/2026, giữ góc/NVS/PIN/vân tay; chip kết nối lại Wi-Fi/MQTT và báo READY. Log ở .local/remote-lock-zero-20261108/.
