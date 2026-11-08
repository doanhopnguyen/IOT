# Cường — backend, MySQL, MQTT và AI xử lý ảnh

IP của bạn: **100.95.248.100**. Bạn chạy server trung tâm; không cần giữ ESP32. Làm trước Thủy/Bằng/Hợp. Đọc 00-THU-TU-CHAY.md đi kèm để biết sơ đồ.

## Chuẩn bị một lần

Cài Java 17 trở lên, Maven, Python 3.11 (64-bit), MySQL 8.0.16+/8.4, Mosquitto 2.x, Tailscale. Nhận source mới nhất, `cuong.zip` và gói model AI từ Hợp. Giải nén cuong.zip vào `.local/received/cuong` sao cho `server.json` nằm trực tiếp trong thư mục đó. Không gửi server.json cho các máy khác.

```powershell
cd D:\DEV\IOT
tailscale ip -4
py -3.11 -m venv .local/venv
.\.local\venv\Scripts\python.exe -m pip install -r scripts/requirements-local.txt
.\.local\venv\Scripts\python.exe -m pip install -r face-node/requirements.txt
.\.local\venv\Scripts\python.exe scripts/team_handoff.py install --role cuong --bundle .local/received/cuong
```

Mosquitto phải được cài trước lệnh install, vì install dùng mosquitto_passwd để tạo file mật khẩu đã hash. Nếu không nằm trong PATH hoặc Program Files, đặt `$env:MOSQUITTO_PASSWD_EXE='D:\duong-dan\mosquitto_passwd.exe'`; khi chạy broker đặt `$env:MOSQUITTO_EXE='D:\duong-dan\mosquitto.exe'`. Không bật broker khác cùng cổng 1884.

Giải nén gói model vào gốc repo, phải có `face-node/models/models/buffalo_l/det_10g.onnx`, `w600k_r50.onnx` và `face-node/models/addons/liveness.onnx`. Có thể copy nguyên `face-node/models` từ Hợp. Kiểm tra:

```powershell
Push-Location face-node
..\.local\venv\Scripts\python.exe -c "from engine import verify_models; verify_models('models', require_liveness=True); print('MODELS OK')"
Pop-Location
```

## Tạo database, rồi mới INSERT admin và thiết bị

Bật MySQL. Mở MySQL CLI; `-p` sẽ hỏi mật khẩu root, không điền mật khẩu vào dòng lệnh:

```powershell
mysql -u root -p
```

Trong MySQL, chạy (đổi đường dẫn nếu clone nơi khác):

```sql
SOURCE D:/DEV/IOT/.local/team/00-create-database.sql;
EXIT;
```

Script tạo DB `smart_access_team` và user local `smartdoor_team`. Nếu user này đã tồn tại từ một bộ cấu hình khác, dừng và dùng DB/user khác sau khi thống nhất; không xóa DB cũ để chữa lỗi. Mật khẩu nằm trong gói riêng. Không cần mở cổng MySQL cho nhóm.

Build backend, chưa cần build admin trên máy này vì Thủy phục vụ admin:

```powershell
Push-Location smart-access-control-backend
mvn.cmd -B clean package
Pop-Location
```

Chạy các cửa sổ riêng tại gốc repo:

```powershell
# Cửa sổ A: broker — khởi động trước backend
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-team.ps1 -Service mqtt
```

```powershell
# Cửa sổ B: backend — chờ Started và Flyway migrate thành công
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-team.ps1 -Service backend
```

Sau khi `/api/health` READY, mở cửa sổ C để INSERT. Backend đã tạo toàn bộ bảng bằng Flyway; không INSERT trước khi migration xong.

```powershell
.\.local\venv\Scripts\python.exe scripts/team_handoff.py seed
```

Lệnh trên đọc **`.local/team/01-seed-admin-device.sql`**, kiểm tra mã không xung đột và INSERT ba bảng `accounts`, `devices`, `device_inventory`. File SQL có sẵn đúng hash của chip Hợp; không cần đăng ký chip bằng USB. Seed lần đầu trên DB mới; không seed lại sau khi Hợp đã nhận cửa.

Nếu muốn chạy SQL trực tiếp thay cho Python: `mysql -u smartdoor_team -p smart_access_team`, rồi `SOURCE D:/DEV/IOT/.local/team/01-seed-admin-device.sql;`. Chỉ chọn một cách. Python được khuyến nghị vì kiểm tra xung đột trước khi ghi; SQL không ghi đè bản ghi đã tồn tại.

Kết quả ban đầu: UID `ESP32-80B54EC8149C`, MAC `80B54EC8149C`, generation 1, INVENTORY, setup_ready=0. Chưa có unit/chủ cửa/PIN/vân tay. Tài khoản admin và mật khẩu ở `.local/team/ADMIN_ACCESS.txt`; gửi riêng file tương ứng cho Bằng. Mã QR trên chip đã khớp DB này; không sinh activationCode mới.

## Bật AI xử lý ảnh/video

Cửa sổ C (sau khi seed xong):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-team.ps1 -Service face-api
```

Chờ `Face enrollment processor ready on 127.0.0.1:8091`. Endpoint là `/extract`, không có `/health`; mở bằng trình duyệt có thể báo 501, điều đó không kiểm tra được inference. Không chạy camera tại đây. Token dịch vụ đã được cài giống backend, không tự thay riêng một bên.

PowerShell **Run as Administrator**, một lần:

```powershell
cd D:\DEV\IOT
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/team-firewall.ps1 -Role cuong
```

## Kiểm tra rồi báo Thủy và Hợp

```powershell
Invoke-RestMethod http://127.0.0.1:8080/api/health
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 8080,1884,8091 } | Select-Object LocalAddress,LocalPort
```

Backend phải READY; broker 1884 nhận kết nối; face 8091 chỉ loopback. Nhờ Hợp chạy Test-NetConnection đến IP Tailscale của bạn. Không lấy READY của HTTP làm bằng chứng MQTT/AI đã chạy: cần cả log broker và dòng Face processor ready.

`APP_DEVICE_BASE_URL` được đặt là `http://10.18.0.194:8080` để ESP32 tải OTA qua gateway Hợp. Nếu IP LAN Hợp đổi, sửa địa chỉ này và khởi động lại backend. API dùng cho laptop/điện thoại vẫn là `http://100.95.248.100:8080`.

Hằng ngày: bật MySQL → MQTT → face-api → backend, giữ các cửa sổ chạy; không tạo lại gói/DB/QR. Ctrl+C dừng đúng dịch vụ. Khi bạn tắt máy/sleep thì nhóm mất server; vẫn có thể dùng quyền offline đã đồng bộ trên chip sau setup.
