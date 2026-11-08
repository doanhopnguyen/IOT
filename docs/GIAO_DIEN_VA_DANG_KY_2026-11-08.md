# Giao diện cài đặt và đăng ký cửa — 08/11/2026

## Cách sử dụng

- **Quản lý cửa:** nút icon cho Thành viên, Duyệt mặt, Khuôn mặt AI, Lịch sử và Cài đặt thiết bị.
- **Cài đặt cửa:** chọn icon trong hai nhóm Vận hành & An ninh / Phần cứng & Hệ thống. Mỗi mục mở một trang riêng, không tải toàn bộ biểu mẫu/chức năng thành một cột dài.
- **PIN mở cửa và PIN Admin:** hai trang riêng; mỗi trang nhập mã mới và xác nhận, chờ thiết bị ACK trước khi báo đã lưu.
- **Servo:** nằm riêng tại Cài đặt cửa → Góc Servo, có quay thử và lưu như trước. Không nằm trong đăng ký mới.
- **Duyệt khuôn mặt:** xem ảnh thu nhỏ của yêu cầu, bấm ảnh hoặc Xem ảnh & chi tiết để mở ảnh lớn và duyệt/từ chối. Yêu cầu cũ không có ảnh hiển thị rõ chưa có ảnh xem trước, không lấy ảnh của hồ sơ mới thay thế.

Icon dùng màu nền pastel theo chức năng; thẻ, ô nhập, nút và bảng chọn dùng cùng hệ góc bo. Giữ font Be Vietnam Pro và bố cục hiện có. Không thêm thư viện native.

## Đăng ký mới: 8 bước

1. Quét QR sản phẩm.
2. Kết nối Wi-Fi.
3. Khởi động lại và kiểm tra kết nối.
4. Đặt tên/nhận cửa.
5. Lưu hai PIN, chờ ACK.
6. Hiệu chỉnh cảm ứng.
7. Xác nhận cảm biến khi cửa đóng.
8. Xác nhận cảm biến khi cửa mở → chờ backend xác nhận sẵn sàng.

Firmware **1.12.0** lưu/xác nhận cấu hình góc đã có hoặc mặc định khi hoàn tất cảm biến cửa. Không chạy motor chỉ để chấp nhận cấu hình này. Cửa mới dùng mặc định khóa 100°/mở 30°, hành trình 180°; người dùng vẫn chỉnh góc và hành trình riêng khi cần. Nâng firmware không ghi đè góc đã lưu. Lệnh hiệu chỉnh cảm ứng/cảm biến từ app cũng giữ cấu hình servo; nút căn servo riêng trên chip vẫn giữ nguyên.

Backend tiếp tục yêu cầu thiết bị xác nhận sẵn sàng; không bỏ kiểm tra ACK hoặc coi gửi lệnh là đã hoàn tất. App đã bỏ SERVO_LOCK/SERVO_OPEN khỏi các trang wizard và cập nhật đúng tổng số bước.

## Kiểm thử và dữ liệu

- Mobile: **84 tests đạt**, typecheck đạt, lint 0 errors / 12 warnings.
- Backend: **350 tests tổng, 340 đạt, 10 bài MySQL phụ thuộc môi trường được bỏ qua**, không lỗi; Maven verify/package đạt. Không chạy reset database hoặc thay dữ liệu người dùng để kiểm thử.
- Firmware: **15/15 bộ host test đạt**, build connected và offline đạt. Test mới chạy chính hàm hoàn tất setup với NVS/motor giả: lưu mặc định, giữ góc tùy chỉnh, lỗi ghi/đọc NVS, chặn khi chưa đủ PIN/cảm ứng/cảm biến; không phát lệnh motor.
- Trình duyệt: kiểm tra giao diện tại 360/390/768 px không tràn ngang; hub không có biểu mẫu xếp chồng; PIN/servo mở riêng; ảnh duyệt phóng to; đăng ký đủ 8 bước kết thúc sau cảm biến mở và không có trang servo. API dùng fixture trong trình duyệt, không tạo tài khoản hoặc thay cấu hình cửa thật.
- Backend kiểm tra ảnh duyệt gắn đúng credential hiện hành và giữ ảnh chụp theo từng yêu cầu; ảnh cũ không có không được thay bằng ảnh của profile mới.
- Đã nạp firmware 1.12.0 lên ESP32 COM5 qua upload thông thường. Đối chiếu INFO trước/sau giữ nguyên UID, generation, cấu hình, Wi-Fi, PIN, 2 thẻ, 2 vân tay và 2 mẫu trong cảm biến. Góc khóa 109°/mở 30° đã lưu được giữ nguyên, `storageFault=0`.

Không reset cửa thật để thử lại đăng ký mới; luồng mới được kiểm tra bằng test logic firmware và UI với API mô phỏng để giữ dữ liệu đang sử dụng. File kiểm thử và ảnh giao diện: `.local/ui-onboarding-20261108/`.

## Tham khảo giao diện

Đã tìm mẫu Pinterest theo yêu cầu nhưng trang tìm kiếm Pinterest không truy cập được bằng công cụ web trong phiên này. Đối chiếu thêm bố cục điều khiển smart-home, icon và thẻ bo tròn tại [Musemind smart-home UI](https://dribbble.com/shots/20268452-Smart-Home-Mobile-App-Home-automation-App-UI-Design) và [Lumeo IoT](https://dribbble.com/shots/25580839-Lumeo-IOT-Mobile-App). Dùng làm tham khảo phân cấp và khoảng cách; không chép ảnh hoặc tài sản thiết kế vào app.

Để xem bản mới, mở lại hoặc Reload ứng dụng trong Expo Go. Với app APK cài riêng, cần build/cập nhật APK mới để lấy JavaScript giao diện mới; chỉ nạp firmware không thay giao diện APK đang cài.
