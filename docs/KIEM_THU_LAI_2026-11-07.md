# Kiểm thử lại và trạng thái bàn giao — 07/11/2026

**Báo cáo lịch sử của lượt trước.** Kết quả rà soát mobile/admin, kiểm thử và trạng thái sạch hiện tại nằm trong [báo cáo mới](RA_SOAT_VA_KIEM_THU_HE_THONG_2026-11-07.md). Các ghi chú thiếu Firewall hoặc snapshot chưa được dọn ở cuối tài liệu này đã được xử lý trong lượt sau; dùng [hướng dẫn hiện tại](CHAY_LAI_SAU_RESET_TAILSCALE.md).

Môi trường: Windows, MySQL cô lập `smart_access_dev_772989`, broker dự án 1884, backend 8080, Expo 8081; ESP32-S3 `80:B5:4E:C8:14:9C` ở COM5. Mã firmware đã build/nạp: **1.4.1**. Bắt đầu chạy lại tại [hướng dẫn từ đầu với Tailscale](CHAY_TU_DAU_TAILSCALE.md).

## Chẩn đoán log ban đầu

Tra database trước khi xóa cho thấy 13 lệnh `SETUP_CREDENTIALS`, gồm các UUID người dùng gửi, đều có `status=FAILED`, `result_message=STORAGE_ERROR`. ACK về sau khoảng 0,2–0,4 giây. Thiết bị nhận được lệnh nhưng báo không lưu được cấu hình. Không thể kết luận mất MQTT chỉ từ dòng “Gửi lệnh”.

Sau nạp lại firmware và khởi tạo sạch, thiết bị thật lưu PIN thành công; thử gửi ba lần, reboot, kiểm tra PIN còn trong bộ nhớ, rồi gửi lại trên backend/firmware cuối cùng đều nhận `PINS_CONFIGURED`. Điều kiện đầu tiên gây lỗi ghi trên firmware cũ chưa được tái hiện chắc chắn. Đã thêm chẩn đoán riêng cho cấu hình không hợp lệ, ghi NVS thất bại và lỗi lưu trữ đã bị giữ từ trước; `INFO` có cờ lỗi, số byte cấu hình và số entry trống. Không tự xóa dữ liệu khi gặp lỗi.

Đã thêm log ACK có UUID/kết quả và giữ lỗi thao tác trên app khi polling trạng thái. Backend khởi động với UTF-8 cho cả stdout/stderr: Java trên máy có `stdout.encoding=Cp1252` dù `file.encoding=UTF-8`, giải thích log tiếng Việt thành dấu hỏi.

Đã tái hiện lỗi giao thức khi gửi HTTPS đến cổng HTTP 8080. Log gốc thiếu request bytes/stack nên đây là một nguyên nhân đã kiểm chứng có thể gây cùng thông báo, chưa xác định chắc request gốc đến từ đâu. Hướng dẫn dùng đúng HTTP/Expo URL; Tailscale không tự bật HTTPS trên Tomcat.

## Kết quả thực tế

| Phần kiểm tra | Kết quả |
|---|---|
| Admin build | Thành công; tài nguyên đóng gói vào backend |
| Backend `mvn verify` | **269 test, 0 fail, 0 error, 0 skip**, build JAR thành công |
| MySQL trong 269 test | 4 DatabaseIntegrationTest + 6 AccountIntegrationTest chạy trên MySQL thật; cập nhật kỳ vọng schema cho đủ V1/V2/V3 |
| Mobile typecheck | Thành công |
| Mobile test | **39/39 đạt** |
| Mobile lint | 0 lỗi, 13 cảnh báo còn lại |
| Mobile export | Android, iOS, web thành công; không phải build APK/IPA có ký |
| Python scripts | **14/14 đạt**, có kiểm tra gateway nhị phân/nhiều client/đóng kết nối và chặn reset nhầm DB/schema/dịch vụ đang chạy |
| Face node unit tests | **9/9 đạt** |
| Firmware host logic | 3 chương trình kiểm tra offline, setup, factory reset đạt |
| Firmware ESP32-S3 | PlatformIO build và upload thành công |
| MQTT thật | **5/5 đạt**: từ chối ẩn danh/sai password; chỉ publish/subscribe topic đúng UID |
| Trình duyệt thật | Admin login/dashboard và mobile web ở khung điện thoại qua IP Tailscale; 0 page error |
| Expo Android thật | Manifest quảng bá đúng IP Tailscale; HTTP 200 cho bundle Metro 7.023.793 byte |
| Edge AI thật | Khởi động webcam/model không preview; heartbeat ACTIVE và lớp Backend.sync xác thực/đồng bộ mẫu qua Tailscale |
| Xử lý hồ sơ mặt thật | Model processor chạy ở 8091, từ chối thiếu token; ảnh trắng không có mặt bị từ chối; upload từ backend đến processor được kiểm tra |

Log được lưu trong `.local/retest-20261106/`. Tên thư mục theo ngày bắt đầu phiên; lượt kiểm thử cuối hoàn tất ngày 07/11.

## Luồng ESP32 thật

Đã xóa dữ liệu trước khi chạy lại, đăng ký MAC qua API admin, cấp phát factory qua USB, kết nối Wi-Fi, nhận cửa qua API và gửi PIN. ESP32 đi qua gateway `10.18.0.194:1885` đến broker `100.111.90.116:1884`.

PIN được giữ sau reboot; thiết bị tiếp tục báo chưa sẵn sàng khi chưa hiệu chỉnh cảm ứng/cửa/servo. Không giả lập ACK của chip thật. Với bản cuối, backend ghi:

```text
ACK ... success=true, result=PINS_CONFIGURED
ACK ... success=true, result=RESET_EMPTY_VERIFIED
```

Reset nghiệp vụ trên chip thật đã hoàn tất: cảm biến xác nhận xóa, backend dọn cửa, tăng generation từ 1 lên 2 và cấp được mã nhận cửa mới. Sau đó thực hiện xóa toàn bộ chip để bàn giao trạng thái chưa cấp phát.

## Nhiều thiết bị và phân quyền

Hai ESP32 mô phỏng dùng hai UID, tài khoản broker và tài khoản chủ cửa riêng, kết nối qua gateway/Tailscale. Kiểm tra đăng ký → online → nhận cửa → PIN/ACK → sẵn sàng → mở từ xa → ACK/lịch sử/CSV/thống kê đều đạt. Chủ cửa B bị từ chối đọc setup và mở cửa A. Reset A xóa đúng cửa A, tăng generation và vô hiệu mã cũ; cửa B vẫn sẵn sàng. Cấp mã mới sau reset thành công.

Đây là hai thiết bị mô phỏng cộng với một chip thật trên máy hiện tại. Chưa kiểm chứng trên nhiều đường Internet độc lập hoặc nhiều ESP32 vật lý. Tài liệu đã chuẩn bị gateway ở từng điểm để người dùng thử tiếp.

Chưa thực hiện thao tác chạm màn hình, đặt nam châm, quan sát chốt servo và đăng ký vân tay/khuôn mặt người dùng thật trong phiên này. Các luồng phần mềm tương ứng có test; kiểm tra cơ khí và nhận diện người thật cần làm tại cửa theo hướng dẫn.

## Trạng thái đã xác minh sau dọn dữ liệu đang hoạt động

| Dữ liệu/dịch vụ | Trạng thái cuối |
|---|---|
| Accounts | 1 bootstrap admin, mật khẩu trong `.local/ADMIN_ACCESS.txt` đã đối chiếu hash |
| Devices, inventory, access_units, user_access | 0 |
| Credentials, face_requests, invitations | 0 |
| Commands, access_logs, audit_logs, telemetry, events | 0 |
| Flyway history | 3 migration còn nguyên |
| MQTT registry | 0 tài khoản thiết bị; password file chỉ có backend |
| TCP dự án 1884, 1885, 8080, 8081, 8091 | Đã đóng |
| ESP32 COM5 | UID trống, `productPrepared=0`, `configBytes=0`, `appPins=0`, `storageFault=0` |
| Vân tay | Xóa với ACK 0x00, đọc lại `FINGERPRINT_COUNT_AFTER=0` |
| RFID reader | Phản hồi version 0x92; cache quyền trên chip đã xóa |

MySQL, Tailscale và broker hệ thống 1883 được giữ làm dịch vụ nền. Chip chưa được đăng ký nên cần làm lại bước đăng ký/cấp phát, không dùng QR/secret cũ.

## Hai bước người dùng còn cần thực hiện

1. **Firewall:** Windows từ chối tạo rule trong phiên không có Administrator (`Windows System Error 5`). Chạy lệnh `configure-network.ps1 ... -Firewall` trong PowerShell Administrator theo hướng dẫn. Chưa xác nhận kết nối vào từ một máy Tailscale ở mạng khác.
2. **File snapshot cũ:** cơ chế duyệt tự động từ chối lệnh xóa snapshot/archives và cả lệnh xóa một file đã chỉ định, trả `blocked by policy`. Các bản sao flash/DB, ghi chú credential cũ và file tạm chứa thông tin Wi-Fi/camera trong `.local` **vẫn còn**. Script [clean-local-snapshots.ps1](../scripts/clean-local-snapshots.ps1) giới hạn rõ đường dẫn file để người dùng tự chạy; thao tác xóa của script chưa được thực thi. Cấu hình/dữ liệu đang hoạt động đã được reset như bảng trên.

```powershell
cd D:\DEV\IOT
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/clean-local-snapshots.ps1 -Apply
```

Không có `-Apply` thì chỉ xem trước số file và dung lượng. Giữ cấu hình hạ tầng hiện tại, dependency/model và admin khởi tạo để khởi động lại dự án.
