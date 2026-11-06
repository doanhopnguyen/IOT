# Phiên chạy cục bộ

Board ESP32-S3 N16R8 được nhận trên **COM5** (USB Espressif). Không dùng các cổng Bluetooth COM3/COM4.

| Thành phần | Địa chỉ |
|---|---|
| Ứng dụng trên laptop | http://localhost:8081 |
| Ứng dụng web trong LAN | http://10.18.3.64:8081 |
| Expo Go trên điện thoại | `exp://10.18.3.64:8081` |
| Backend | http://10.18.3.64:8080 |
| Broker riêng | `10.18.3.64:1884` |
| Database riêng | `smart_access_dev_772989` |
| User MySQL chỉ có quyền database trên | `iot_dev_772989@localhost` |
| Đăng nhập ứng dụng | `admin@smartdoor.local` |

Mật khẩu nằm trong [`.local/ACCESS.txt`](../.local/ACCESS.txt). Cấu hình/secret của thiết bị, face node và broker ở `.local/runtime.json`; các file này được Git bỏ qua. Không dùng mật khẩu MySQL root để đăng nhập ứng dụng.

Sau khi làm sạch theo yêu cầu ngày 06/11/2026, backend, Expo và broker riêng đã dừng; các cổng 8080, 8081, 1884 đang trống. MySQL80 vẫn chạy trên 3306 vì phiên PowerShell hiện tại không có quyền dừng Windows service. Face AI cũng đang dừng; chỉ chạy lại khi cần. Log được giữ trong `.local`. Khi chạy `start-local.ps1 -Component face`, Face AI dùng webcam0 và mở cửa sổ camera có khung mặt cùng kết quả nhận diện; nhấn Q để dừng.

Để chạy lại, xác nhận `MySQL80` đang chạy (`Get-Service MySQL80`). Nếu đã dừng, mở PowerShell bằng quyền Administrator và chạy `Start-Service MySQL80`. Sau đó mở các terminal riêng tại `D:\DEV\IOT`:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-local.ps1 -Component broker
powershell -ExecutionPolicy Bypass -File .\scripts\start-local.ps1 -Component backend
powershell -ExecutionPolicy Bypass -File .\scripts\start-local.ps1 -Component mobile
powershell -ExecutionPolicy Bypass -File .\scripts\start-local.ps1 -Component face
```

Mỗi lệnh giữ terminal để chạy dịch vụ; không chạy thêm bản trùng khi cổng đang được dùng. Script dùng MySQL và Mosquitto đã có trên máy; broker hệ thống port1883 không bị thay đổi. `bootstrap_local.py` chỉ dùng khi cấp phát môi trường mới, không chạy lại để reset môi trường hiện tại.

Kiểm tra không điều khiển servo:

```powershell
.\.local\venv\Scripts\python.exe scripts\verify-local.py
.\.local\venv\Scripts\python.exe scripts\check-web.py
```

Backend giữ lại một tài khoản admin; dữ liệu thiết bị, cửa, thành viên, sự kiện, lệnh và telemetry đã được xóa; lịch sử Flyway được giữ. Phiên app cũ mất hiệu lực khi dừng backend. ESP32-S3 tại COM5 đã xóa toàn bộ flash 16 MB và nạp lại firmware connected 1.4.0; MAC/eFuse được giữ. Trạng thái đọc được: chưa cấp phát danh tính, chưa có Wi-Fi/PIN, 0 mẫu vân tay, `productPrepared=0`. Để thử nhận cửa, tạo cấp phát và QR mới ở admin rồi nạp bundle mới; không dùng JSON/QR cũ trong `.local`.

Rule Windows Firewall **Smart Access local development** từng được mở cho LocalSubnet tới 1884/8080/8081, sau đó **đã gỡ theo yêu cầu người dùng** bằng `scripts/remove-lan.ps1`. Các rule khác giữ nguyên. Truy cập từ ESP32/điện thoại có thể bị chặn; localhost và dữ liệu DB không bị thay đổi. Không tự chạy lại `enable-lan.ps1` nếu chưa muốn mở LAN trở lại.

Nếu laptop đổi IP/mạng, cập nhật địa chỉ trong firmware, mobile `.env` và backend CORS. ESP32 đổi Wi-Fi qua TFT; đổi broker IP vẫn cần cập nhật cấu hình firmware.

## Tài khoản đăng ký thiết bị như thế nào?

1. Admin tạo thiết bị trước qua `POST /api/admin/devices` (session admin + CSRF), cung cấp deviceUid/deviceName/deviceType. Hiện cấp phát mới có API, chưa có màn hình quản trị tương ứng trong app.
2. Nạp UID/secret và cấu hình broker đúng lên ESP32. Thiết bị phải chưa thuộc cửa nào và không trong MAINTENANCE/SUSPENDED/DECOMMISSIONED.
3. Tài khoản người dùng đăng nhập, chọn **Thêm thiết bị → Nhập mã thiết bị**, nhập UID đã cấp, xác nhận và đặt tên cửa. App gửi `POST /api/units` với unitName/deviceCode; backend tạo cửa và gắn thiết bị trong cùng transaction.
4. Chọn Wi-Fi trên TFT ESP32. Ô tên Wi-Fi trong wizard app hiện không gửi cấu hình sang ESP32 và không thay thao tác này.

Database hiện không còn bản ghi thiết bị nào. Chip COM5 đang ở trạng thái firmware mới chưa cấp phát; cần đăng ký lại MAC và tạo QR/secret mới để thử onboarding. Chưa có luồng chuyển chủ sở hữu trong app.
