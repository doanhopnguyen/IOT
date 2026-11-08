# Kiểm thử OTA và bàn giao sạch — 08/11/2026

Đây là biên bản lượt OTA 1.13.0 → 2.0.0-demo trước khi thêm còi. Bản hiện tại **1.14.0 / 2.0.1-demo** và kết quả thử còi nằm ở [COI_CANH_BAO.md](COI_CANH_BAO.md); danh tính và QR bàn giao của lượt này được giữ nguyên.

## Kết quả chính

Đã chạy cập nhật **trên ESP32-S3 thật, COM5**: bản cơ sở **1.13.0 → 2.0.0-demo**. Bản demo dùng nền nút đen, chữ/viền trắng; các chức năng cửa dùng cùng mã nguồn với bản cơ sở. Admin phát hành tệp qua trình duyệt, chủ cửa xác nhận qua API được bảo vệ bằng phiên đăng nhập/CSRF. App của chủ cửa đã hiển thị kết quả cập nhật từ backend thật.

Thiết bị tải tệp qua LAN, kiểm tra SHA-256, khởi động lại và gửi `FIRMWARE_UPDATED:2.0.0-demo`. Backend nhận ACK; heartbeat tiếp theo báo đúng phiên bản. Tệp tải lại bị chặn sau khi hoàn tất và cùng phiên bản không được cài lại.

Trước lượt thành công, cửa đang mở và firmware trả `OTA_CLOSE_AND_LOCK_DOOR`; không ghi firmware trong trạng thái đó. Sau khi người dùng đóng cảm biến cửa thật, lượt cập nhật được chấp nhận. Không giả lập tín hiệu cảm biến để bỏ qua điều kiện này.

## Dữ liệu được giữ qua OTA

Đối chiếu USB `INFO` trước và sau cập nhật thật:

| Trường | Trước | Sau |
|---|---|---|
| UID | ESP32-80B54EC8149C | Giữ nguyên |
| Generation | 1 | 1 |
| Mạng Wi-Fi đã lưu | 1 | 1 |
| Kích thước cấu hình | 596 byte | 596 byte |
| Thẻ | 2 | 2 |
| Vân tay trong cấu hình | 2 | 2 |
| Mẫu trong cảm biến | 2 | 2 |
| Góc khóa/mở | 109° / 30° | 109° / 30° |
| PIN ứng dụng, cảm biến cửa, servo sẵn sàng | Có | Có |
| Lỗi bộ nhớ | 0 | 0 |

Đã kiểm tra kết nối lại MQTT. Đối chiếu này xác nhận trạng thái, số lượng và cấu hình chẩn đoán được giữ; không phải một lượt thử khớp lại từng vân tay/thẻ hay nhập lại PIN thật.

## Các bộ kiểm thử

| Phạm vi | Kết quả |
|---|---|
| Backend, gồm hai lớp tích hợp MySQL và các luồng OTA mới | **357/357**, không skip |
| Mobile API/trạng thái và hồi quy | **86/86** |
| Mobile TypeScript | Đạt |
| Mobile lint | 0 lỗi, 12 cảnh báo có sẵn |
| Firmware host: PIN/HX-543, hạn chế, setup, reset, Wi-Fi, servo, QR, OTA | **17/17 nhóm** |
| Face node | **27/27** |
| Công cụ Python | **16/16** |
| MQTT xác thực và ACL | **5/5** |
| Luồng tích hợp trên backend/MQTT đang chạy với hai thiết bị mô phỏng | **15/15 nhóm** |
| Build bản cơ sở, demo và firmware bảo trì | Đạt |

15 nhóm nghiệp vụ gồm: đăng nhập/phân quyền admin; nhận cửa riêng theo chủ; không nhận lại mã đã dùng; đồng ý lời mời; quyền thành viên; lockdown; cài đặt cửa; RFID/vân tay chờ ACK; không nhận embedding khuôn mặt từ client; hồ sơ khách; bảo trì/tạm ngưng; khóa tài khoản và hủy phiên; lịch sử/CSV/thống kê; reset đúng cửa và generation; mã mới cần ACK và thu hồi vĩnh viễn.

Các lượt RFID/vân tay trong kiểm thử nghiệp vụ dùng thiết bị MQTT mô phỏng. Trên phần cứng thật đã kiểm tra phản hồi UART, bộ nhớ mẫu cảm biến, RC522 và cập nhật firmware; camera laptop mở được ảnh **640×480**. Không tuyên bố đã thử lại toàn bộ thao tác sinh trắc học, cơ khí hoặc ứng dụng native trên điện thoại. Giao diện app được kiểm tra bằng trình duyệt, gồm màn hình 360/390 px.

Kiểm thử worker OTA chạy chính hàm production với HTTP/flash/NVS giả lập: lỗi HTTP, sai kích thước, không có phân vùng, lỗi ghi, tải thiếu, sai digest, không lưu được biên nhận, ảnh bị từ chối, HTTP host không hợp lệ và thiếu CA cho HTTPS. Biên nhận phải lưu trước khi chọn phân vùng khởi động. mbedTLS thật và ghi flash thật được dùng trong lượt OTA thành công trên chip; kiểm thử host không thay thế thử cắt nguồn vật lý.

## Giao diện admin và chủ cửa

- Admin tải tệp thật `.bin` và thấy bản phát hành trong danh sách; không còn mục/nút đăng ký chip hoặc cấp QR.
- Chủ cửa thấy thông báo có bản mới, mở trang Cập nhật, xem nội dung và xác nhận rõ ràng. Hủy xác nhận không gửi lệnh.
- Khi đang cập nhật, nút cập nhật bị vô hiệu hóa. Giao diện đợi cả ACK và phiên bản thiết bị mới hiển thị hoàn tất; có hướng dẫn đóng cửa khi bị từ chối.
- Trang cập nhật thật của chủ cửa đã hiển thị **2.0.0-demo** và thông báo hoàn tất từ backend thật sau lượt OTA.
- Chuẩn bị chủ cửa thử bằng một tài khoản dùng một lần gắn vào cửa đã cấu hình qua fixture SQL; thao tác này phục vụ kiểm thử, không phải chức năng chuyển chủ do admin cung cấp. Fixture đã bị xóa khi bàn giao.

Ảnh minh họa kiểm thử: [admin phát hành](../.local/ota-demo-20261108/admin-firmware.png), [chủ cửa nhận bản mới](../.local/ota-demo-20261108/owner-update-available.png), [kết quả OTA thật trong app](../.local/ota-demo-20261108/owner-real-ota-complete.png).

## Trạng thái sau khi xóa và nạp lại

Sau toàn bộ kiểm thử, đã dừng dịch vụ, xóa dữ liệu nghiệp vụ và các fixture/bí mật dùng thử; giữ **nguyên toàn bộ bản ghi admin cũ**, gồm ID và hash mật khẩu. Đối chiếu SHA-256 bản ghi admin với mốc trước reset và kiểm tra mật khẩu đều đạt.

Đã nạp firmware bảo trì, xóa 2 mẫu vân tay và đọc lại **0 mẫu**, RC522 phản hồi **0x92**. Sau đó xóa toàn bộ flash và nạp lại bản cơ sở **1.13.0** bằng USB. Cuối cùng cấp phát mới danh tính/QR để chủ nhà có thể nhận cửa ngay.

| Thành phần bàn giao | Trạng thái |
|---|---|
| Admin | 1 tài khoản cũ, không thay đổi |
| Tài khoản thường, cửa đã nhận, credential, ảnh/khuôn mặt, lịch sử, telemetry, lệnh, audit | 0 |
| Danh tính sản phẩm | 1 thiết bị mới cấp phát, `INVENTORY`, chưa thuộc tài khoản nào |
| Firmware đã nạp | 1.13.0, nền nút đỏ, có OTA |
| Dữ liệu người dùng trên chip | Wi-Fi/PIN/thẻ/vân tay/cấu hình: 0 |
| Mẫu trong cảm biến | 0 |
| Danh tính/QR trên chip | Đã chuẩn bị, `productPrepared=1` |
| Bản phát hành trong DB | 0; admin tự tải demo lên để biểu diễn từ đầu |
| Tệp demo trên laptop | `.local/releases/firmware-v2.0-demo.bin`, khoảng 1.05 MiB |
| Cổng dự án 1884/1885/8080/8081/8091/8092 | Đã đóng |

Danh tính sản phẩm duy nhất được tạo **sau khi xóa dữ liệu**, để QR mới có bản ghi chưa nhận hợp lệ trong backend. Không giữ cửa/người dùng thử. Mật khẩu MQTT mới được cấp lại; cấu hình và danh tính camera AI cũ đã dọn.

Ảnh QR mới đã được OpenCV giải mã, đối chiếu đủ UID, mã nhận cửa và thông tin AP với file cấp phát. API inspect nhận đúng mã chưa sử dụng; không thực hiện nhận cửa để thử nên sản phẩm vẫn chưa có chủ. QR không chứa secret xác thực thiết bị.

Bằng chứng máy kiểm tra: [final-state.json](../.local/ota-demo-20261108/final-state.json), [kết quả OTA thật](../.local/ota-demo-20261108/physical-ota-result.json), [đối chiếu dữ liệu qua OTA](../.local/ota-demo-20261108/ota-preservation.json).

## Thao tác tiếp theo

Làm theo [hướng dẫn chạy và demo OTA](DEMO_CAP_NHAT_FIRMWARE_TU_XA.md) từ bước 1. Chủ nhà thiết lập bằng QR mới, admin tải tệp demo lên, chủ nhà đồng ý cài đặt. Không cần đăng ký lại chip và không chạy reset lần nữa.

Đợt kiểm thử OTA này dùng HTTP trong LAN của cửa và backend; điện thoại/web dùng Tailscale. Với cửa ở site khác cần đường tải 8080 riêng qua gateway; URL tải hiện là cấu hình chung, chưa phân phối URL theo từng site. Chưa thực hiện kiểm thử mất nguồn thật, hạ phiên bản qua OTA hoặc firmware ký số phục vụ Internet công khai.
