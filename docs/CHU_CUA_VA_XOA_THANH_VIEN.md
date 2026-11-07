# Thẻ/vân tay của chủ cửa và xóa thành viên

Cập nhật 07/11/2026; cần backend mới và firmware **1.5.0**. Bản này đã được build, nạp vào ESP32 COM5 và khởi động backend trên máy hiện tại. Tải lại app và đăng nhập lại sau khi backend khởi động lại.

## Chủ cửa tự đăng ký

Vào **Cài đặt cửa → Thẻ và vân tay của bạn**. Chủ cửa có thể xem/thu hồi phương thức của mình, thêm vân tay và thêm thẻ bằng đầu đọc NFC/RFID của ESP32.

Luồng thêm thẻ cho cả chủ cửa và thành viên: bấm **Thêm thẻ NFC/RFID** → app mở hộp thoại chờ → đưa thẻ sát đầu đọc trên ESP32 trong 30 giây → chip xác nhận đã đọc → app đăng ký thẻ và báo kết quả. Không có ô nhập UID thủ công. Nếu hết thời gian hoặc đầu đọc chưa sẵn sàng, app báo lỗi để bắt đầu lại; không đăng ký thẻ khi chưa có xác nhận đọc hợp lệ.

Mục này có ngay sau khi nhận cửa; nút đăng ký được bật khi hoàn tất Wi-Fi, PIN và hiệu chỉnh, cửa báo sẵn sàng. Khi thêm vân tay, làm theo màn hình cảm biến: đặt ngón tay, nhấc hẳn ra rồi đặt lại cùng ngón tay. Chỉ báo lưu thành công sau ACK. Quét thẻ dùng đầu đọc trên ESP32, không dùng đầu đọc NFC của điện thoại.

Backend dùng endpoint owner-access để lấy đúng ID chủ cửa và bảo đảm quan hệ quyền nội bộ tồn tại. Chủ cửa không được tính thành thành viên trong danh sách và không được tự xóa mình qua thao tác xóa thành viên.

## Xóa thành viên

1. Chọn xóa trong chi tiết thành viên. Backend thu hồi ngay quyền Face/RFID/vân tay/mở từ xa, đánh dấu các thẻ và vân tay tại cửa là đã thu hồi.
2. Thành viên tạm giữ trong danh sách với trạng thái chờ xóa. Backend lưu tác vụ trong bảng commands và gửi `MEMBER_REMOVE`; khi mất mạng hoặc backend khởi động lại, tác vụ được gửi lại trong cấu hình heartbeat đã xác thực.
3. ESP32 ghi lại danh sách quyền không có thành viên đó vào NVS, xóa mẫu khỏi cảm biến vân tay rồi đọc lại bitmap để kiểm chứng. Các ô đang thuộc người khác được bảo vệ; ô mồ côi sau đăng ký timeout cũng được xử lý để ACK đến muộn không tái tạo quyền.
4. Chỉ ACK đúng `MEMBER_CREDENTIALS_REMOVED` mới hoàn tất: backend xóa các credential RFID/vân tay của người đó tại cửa, dọn yêu cầu Face ở cửa rồi xóa quan hệ thành viên. Lịch sử ra vào được giữ nhưng bỏ liên kết đến credential đã xóa. Tài khoản tự đăng ký, hồ sơ Face dùng chung và quyền/credential ở cửa khác được giữ. Riêng hồ sơ chỉ dùng tại cửa (người chưa có ứng dụng, do chủ cửa này tạo, không ở cửa nào khác): tài khoản bị xóa hẳn nếu chưa có lịch sử ra vào, còn có lịch sử thì bị ẩn (DISABLED, giữ họ tên cho lịch sử).

Khi chip offline, bộ nhớ chip chỉ thay đổi được lúc chip kết nối lại. App tiếp tục hiển thị chờ, không báo đã xóa hoàn tất. Nếu lỗi cảm biến hoặc lưu trữ, tác vụ tiếp tục chờ/gửi lại; sửa kết nối cảm biến và giữ chip online.

Mỗi cửa xử lý một lần xóa thành viên tại một thời điểm. Đăng ký thẻ/vân tay mới và khôi phục quyền của người đang xóa bị chặn trong lúc chờ. ESP32 lưu số thứ tự xóa đã hoàn tất để bản tin cũ không xóa nhầm ô vừa được tái sử dụng.

Thẻ NFC/RFID được xóa khỏi danh sách cho phép trên ESP32; mẫu vân tay được xóa khỏi bộ nhớ cảm biến. Firmware cũ không thực hiện giao thức này nên phải nâng cấp trước khi dùng.

## Kiểm tra đã chạy

- Backend: 274 ca được phát hiện, **264 chạy đạt**, 10 ca MySQL tùy chọn được bỏ qua; JAR build thành công. Có 7 bài tích hợp H2 cho quyền chủ cửa, chờ xóa offline, ACK sai/thất bại, xóa đúng cửa, giữ lịch sử, bảo vệ slot dùng lại và ACK đăng ký đến muộn.
- Mobile: typecheck đạt, **41/41 test đạt**, lint 0 lỗi và 13 cảnh báo hiện có.
- Firmware: build/upload đạt; 4 chương trình kiểm tra native đạt, gồm chạy chính hàm xóa thành viên với ArduinoJson thật và cảm biến/NVS giả lập lỗi.
- Sau upload: đọc lại `firmware=1.5.0`; UID, generation, số byte config, cờ PIN và số mẫu vân tay khớp trước upload. Backend READY.

Log: `.local/member-credentials-20261107/`. Chưa dùng mẫu vân tay hoặc thẻ thật của người dùng để thực hiện một lượt xóa thành viên trên phần cứng trong phiên này; kiểm tra phần cứng dùng hàm production với lỗi giả lập và nạp firmware thật.
