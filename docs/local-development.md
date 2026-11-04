# Phiên chạy cục bộ

Đã nạp board ESP32-S3 N16R8 qua cổng thực tế **COM6** (USB CH343). Không dùng các cổng Bluetooth COM3/COM4.

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

Backend, broker và Expo đã được khởi chạy nền bằng PowerShell ẩn. Face AI đã chạy thành công rồi **được dừng theo yêu cầu tắt camera của người dùng**; chỉ chạy lại khi cần. Log lưu trong `.local`: `backend-current.out.log`, `backend-current.err.log`, `broker.out.log`, `broker.err.log`, `mobile.out.log`, `mobile.err.log`, `face.out.log`, `face.err.log`. Khi bật, Face AI dùng webcam0, không bật cửa sổ preview, vẫn yêu cầu liveness và quyền backend.

Để chạy lại sau khi tắt máy, mở các terminal riêng tại `D:\DEV\IOT`:

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

Đã xác nhận: migration MySQL thành công, đăng nhập session/CSRF thành công, MQTT xác thực ba tài khoản, bundle web HTTP200, ESP32 ACTIVE và Face AI ACTIVE qua heartbeat. Chưa đăng ký RFID/vân tay/khuôn mặt/PIN cho người dùng mới và chưa thử mở servo.

Rule Windows Firewall **Smart Access local development** từng được mở cho LocalSubnet tới 1884/8080/8081, sau đó **đã gỡ theo yêu cầu người dùng** bằng `scripts/remove-lan.ps1`. Các rule khác giữ nguyên. Truy cập từ ESP32/điện thoại có thể bị chặn; localhost và dữ liệu DB không bị thay đổi. Không tự chạy lại `enable-lan.ps1` nếu chưa muốn mở LAN trở lại.

Nếu laptop đổi IP/mạng, cập nhật địa chỉ trong firmware, mobile `.env` và backend CORS. ESP32 đổi Wi-Fi qua TFT; đổi broker IP vẫn cần cập nhật cấu hình firmware.

## Tài khoản đăng ký thiết bị như thế nào?

1. Admin tạo thiết bị trước qua `POST /api/admin/devices` (session admin + CSRF), cung cấp deviceUid/deviceName/deviceType. Hiện cấp phát mới có API, chưa có màn hình quản trị tương ứng trong app.
2. Nạp UID/secret và cấu hình broker đúng lên ESP32. Thiết bị phải chưa thuộc cửa nào và không trong MAINTENANCE/SUSPENDED/DECOMMISSIONED.
3. Tài khoản người dùng đăng nhập, chọn **Thêm thiết bị → Nhập mã thiết bị**, nhập UID đã cấp, xác nhận và đặt tên cửa. App gửi `POST /api/units` với unitName/deviceCode; backend tạo cửa và gắn thiết bị trong cùng transaction.
4. Chọn Wi-Fi trên TFT ESP32. Ô tên Wi-Fi trong wizard app hiện không gửi cấu hình sang ESP32 và không thay thao tác này.

Board hiện tại `door-80b54ec8149c` đã thuộc cửa `Cua ESP32-S3`, do `admin@smartdoor.local` quản lý. Tài khoản khác không đăng ký lại cùng board; nếu dùng chung, chủ cửa thêm tài khoản đó vào danh sách thành viên và cấp quyền. Chưa có luồng chuyển chủ sở hữu trong app.
