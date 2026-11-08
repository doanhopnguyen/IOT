# Thông báo trong Expo Go

Dự án đang dùng Expo SDK 58. Theo [tài liệu Expo Notifications SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/notifications/), push từ máy chủ không có trong Expo Go trên Android từ SDK 53; cần development build hoặc bản app riêng. Thông báo cục bộ vẫn được Expo Go hỗ trợ.

Với yêu cầu nhận cảnh báo từ máy chủ như app cài riêng, bản Expo Go hiện tại dùng phương án hiển thị trong app:

- **INFO / WARNING:** banner nổi phía trên, tự ẩn sau **6 giây**. Không che nền, không chặn màn hình hay hộp thoại bên dưới, không làm mất focus của ô đang nhập. Chạm banner để mở danh sách cảnh báo hoặc bấm × để đóng.
- **CRITICAL và cảnh báo PIN cần lựa chọn xử lý:** popup ở giữa, giữ nguyên cho đến khi đóng hoặc xử lý. Giữ hai nút **Cửa vẫn an toàn / Tạm thời khóa cửa**, chờ chip xác nhận trước khi hoàn tất.
- Khẩn cấp được ưu tiên ngay cả khi đang hiện banner thường. Các thông báo thường chờ trong hàng đợi và tiếp tục sau popup; đồng hồ tự ẩn tạm dừng khi app ở nền.
- Ẩn banner hoặc đóng popup không gửi lệnh tắt chuông và không xóa lịch sử cảnh báo.

Lượt sửa này không đăng ký push token, không yêu cầu quyền thông báo hệ thống, không cài thêm thư viện notification. Khi Expo Go ở nền/tắt, luồng đọc cảnh báo từ máy chủ dừng; mở app lại sẽ đọc các cảnh báo chưa xem. Nhận cảnh báo server trực tiếp cả khi app đóng cần triển khai push cho bản build riêng.

## Kiểm tra 08/11/2026

96/96 bài mobile đạt, typecheck đạt, lint 0 lỗi với 12 cảnh báo có sẵn. Kiểm thử trình duyệt dùng API giả lập: banner ở đầu màn hình 360/390 px, tự ẩn dù đang polling; không chặn form/không mất focus; popup khẩn cấp ưu tiên và không tự ẩn; tiếp tục hàng đợi thường; hai lựa chọn PIN vẫn chờ ACK; chạm banner mở danh sách cảnh báo. Không phát lệnh tới cửa thật.

Ảnh và log: `.local/notification-banner-20261108/`.