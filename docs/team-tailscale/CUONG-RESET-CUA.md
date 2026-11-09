# Hướng dẫn Toàn Tập cho Cường — Máy chủ Backend, MySQL, MQTT TLS Funnel & AI Xử lý Ảnh

- **IP Tailscale của Cường**: `100.95.248.100`
- **Tên miền Funnel công khai cho ESP32**: `desktop-s2r046u.tailad91e1.ts.net` (cổng `8443` cho MQTT over TLS, cổng `443` cho HTTPS/OTA)
- **Thiết bị ESP32-S3 của Hợp**: `ESP32-80B54EC8149C` (MAC `80B54EC8149C`, firmware `2.0.5-demo`). Chip của Hợp đã được xóa flash và nạp lại cấu hình kết nối thẳng tới `desktop-s2r046u.tailad91e1.ts.net:8443`, hiện đang ở màn hình QR xuất xưởng (`claimed=0`, `generation=1`).

---

## PHẦN 1. Chuẩn bị lần đầu (Bỏ qua nếu máy Cường đã cài xong trước đó)

1. Cài đặt: **Java 17+**, **Maven**, **Python 3.11 (64-bit)**, **MySQL 8.0+**, **Mosquitto 2.x**, **Tailscale**.
2. Giải nén `cuong.zip` vào `.local/received/cuong` (sao cho `server.json` nằm trực tiếp trong `.local/received/cuong/server.json`).
3. Giải nén `AI-MODELS.zip` vào thư mục gốc repo `D:\DEV\IOT` (sao cho có `face-node/models/models/buffalo_l/det_10g.onnx`, `w600k_r50.onnx` và `face-node/models/addons/liveness.onnx`).
4. Mở PowerShell tại `D:\DEV\IOT` và chạy:

```powershell
cd D:\DEV\IOT
py -3.11 -m venv .local/venv
.\.local\venv\Scripts\python.exe -m pip install -r scripts/requirements-local.txt
.\.local\venv\Scripts\python.exe -m pip install -r face-node/requirements.txt
.\.local\venv\Scripts\python.exe scripts/team_handoff.py install --role cuong --bundle .local/received/cuong
```

5. Tạo database `smart_access_team` và tài khoản `smartdoor_team` (nếu chưa tạo):

```powershell
mysql -u root -p
```
Trong `mysql>` chạy:
```sql
SOURCE D:/DEV/IOT/.local/team/00-create-database.sql;
EXIT;
```

6. Mở tường lửa Windows cho nhóm (chạy PowerShell bằng **Run as Administrator** 1 lần):

```powershell
cd D:\DEV\IOT
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/team-firewall.ps1 -Role cuong
```

---

## PHẦN 2. Cập nhật cấu hình OTA trực tiếp & Build Backend

Vì ESP32 của Hợp nay kết nối thẳng qua Internet (`desktop-s2r046u.tailad91e1.ts.net`) mà không đi qua gateway LAN trên laptop Hợp nữa, hãy cập nhật `APP_DEVICE_BASE_URL` trong `.local/team/backend.env`:

```powershell
cd D:\DEV\IOT
(Get-Content .local\team\backend.env) -replace '^APP_DEVICE_BASE_URL=.*$', 'APP_DEVICE_BASE_URL=https://desktop-s2r046u.tailad91e1.ts.net' | Set-Content .local\team\backend.env -Encoding UTF8
Select-String -Path .local\team\backend.env -Pattern 'APP_DEVICE_BASE_URL'
```

Nếu vừa kéo code mới từ Git về, build lại file JAR của Backend:

```powershell
Push-Location smart-access-control-backend
mvn.cmd -B clean package -DskipTests
Pop-Location
```

---

## PHẦN 3. Khởi động 3 dịch vụ trên máy Cường

Mở **3 cửa sổ PowerShell riêng** tại `D:\DEV\IOT`:

### Cửa sổ 1 — MQTT Broker (Chạy trước tiên)
```powershell
cd D:\DEV\IOT
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-team.ps1 -Service mqtt
```
*(Đảm bảo Tailscale Funnel của bạn vẫn đang mở chuyển tiếp cổng `8443` về broker và cổng `443` về `127.0.0.1:8080`).*

### Cửa sổ 2 — Backend Spring Boot (`:8080`)
```powershell
cd D:\DEV\IOT
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-team.ps1 -Service backend
```
*(Chờ đến khi log in ra `Started ...` và Flyway tạo bảng xong).*

### Cửa sổ 3 — AI Xử lý Ảnh đăng ký khuôn mặt (`127.0.0.1:8091`)
```powershell
cd D:\DEV\IOT
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-team.ps1 -Service face-api
```
*(Chờ dòng `Face enrollment processor ready on 127.0.0.1:8091`).*

---

## PHẦN 4. Khởi tạo hoặc Reset cửa `ESP32-80B54EC8149C` về trạng thái chờ nhận (`INVENTORY`)

Do Hợp vừa xóa trắng flash và nạp lại chip `ESP32-80B54EC8149C`, database của Cường cần đưa thiết bị này về đúng trạng thái xuất xưởng (`state = 'INVENTORY'`, `generation = 1`, `setup_ready = 0`, `unit_id = NULL`, khớp mã QR hiện tại trên chip).

### Cách làm:
1. Nếu bạn **chưa từng chạy seed lần nào**, chạy lệnh này trước trong PowerShell:
   ```powershell
   cd D:\DEV\IOT
   .\.local\venv\Scripts\python.exe scripts/team_handoff.py seed
   ```
2. Nếu trước đó **Hợp đã từng quét QR nhận cửa** (hoặc thiết bị đang ở trạng thái `CLAIMED` / `ACTIVE` / `RESETTING`), hãy mở MySQL và chạy khối SQL reset dưới đây để xóa cửa cũ và đưa chip về lại `INVENTORY`:

```powershell
mysql -u smartdoor_team -p smart_access_team
```
*(Hoặc `mysql -u root -p smart_access_team`)*

Copy và dán toàn bộ khối lệnh sau vào `mysql>`:

```sql
START TRANSACTION;

-- 1. Tìm device_id và unit_id hiện tại của chip ESP32-80B54EC8149C
SELECT device_id, unit_id INTO @dev_id, @u_id
FROM devices
WHERE device_uid = 'ESP32-80B54EC8149C'
LIMIT 1;

-- 2. Nếu thiết bị đã từng được gắn vào một cửa, xóa sạch dữ liệu của cửa cũ theo đúng thứ tự khóa ngoại
DELETE FROM door_invitations WHERE unit_id = @u_id;
DELETE FROM access_logs WHERE unit_id = @u_id OR source_device_id = @dev_id;
DELETE FROM face_requests WHERE unit_id = @u_id;

DELETE c FROM credentials c JOIN devices d ON c.device_id = d.device_id WHERE d.unit_id = @u_id OR d.device_id = @dev_id;
DELETE cmd FROM commands cmd JOIN devices d ON cmd.device_id = d.device_id WHERE d.unit_id = @u_id OR d.device_id = @dev_id;
DELETE era FROM event_related_accounts era JOIN events e ON era.event_id = e.event_id JOIN devices d ON e.device_id = d.device_id WHERE d.unit_id = @u_id OR d.device_id = @dev_id;
DELETE e FROM events e JOIN devices d ON e.device_id = d.device_id WHERE d.unit_id = @u_id OR d.device_id = @dev_id;
DELETE t FROM telemetry t JOIN devices d ON t.device_id = d.device_id WHERE d.unit_id = @u_id OR d.device_id = @dev_id;
DELETE FROM user_access WHERE unit_id = @u_id;

-- Xóa các thiết bị phụ (ví dụ node camera AI) thuộc cửa cũ, giữ lại ESP32-80B54EC8149C
DELETE FROM devices WHERE unit_id = @u_id AND device_uid <> 'ESP32-80B54EC8149C';

-- 3. Đưa bản ghi ESP32-80B54EC8149C về trạng thái mới đăng ký kho
UPDATE devices
SET unit_id = NULL,
    local_admin_pin_enabled = FALSE,
    local_admin_pin_hash = NULL,
    firmware_version = '2.0.5-demo',
    lifecycle_status = 'REGISTERED',
    last_seen_at = NULL,
    updated_at = NOW(3)
WHERE device_uid = 'ESP32-80B54EC8149C';

-- 4. Xóa cửa cũ (nếu có)
DELETE FROM access_units WHERE unit_id = @u_id;

-- 5. Khôi phục mã nhận cửa (claim_hash khớp mã QR xuất xưởng trên chip của Hợp), generation = 1, state = 'INVENTORY'
UPDATE device_inventory
SET claim_hash = '95c6d102f32c6f2991e0f871dde454f94d93468029fc788a7ac4c3fb8c17d80c',
    state = 'INVENTORY',
    generation = 1,
    setup_ready = FALSE,
    door_closed = NULL,
    latch_released = NULL,
    recipient_id = NULL,
    operation_uuid = NULL,
    operation_generation = NULL,
    operation_actor_id = NULL,
    state_updated_at = NOW(3)
WHERE factory_mac = '80B54EC8149C';

COMMIT;

-- 6. Kiểm tra kết quả sau khi reset
SELECT d.device_uid, i.factory_mac, i.state, i.generation, i.setup_ready, d.unit_id
FROM devices d
JOIN device_inventory i ON i.device_id = d.device_id
WHERE d.device_uid = 'ESP32-80B54EC8149C';
```

### Kết quả đúng bắt buộc phải hiện ra:

| device_uid | factory_mac | state | generation | setup_ready | unit_id |
|---|---|---|---|---|---|
| `ESP32-80B54EC8149C` | `80B54EC8149C` | `INVENTORY` | `1` | `0` | `NULL` |

---

## PHẦN 5. Kiểm tra nhanh rồi báo cho Hợp

Chạy lệnh sau trong PowerShell trên máy Cường để xác nhận cả 3 cổng đã lắng nghe và `/api/health` trả về `READY`:

```powershell
Invoke-RestMethod http://127.0.0.1:8080/api/health
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 8080,1884,8091 } | Select-Object LocalAddress,LocalPort
```

Sau khi thấy:
1. `status = READY`
2. Cổng `8080`, `1884`, `8091` đều đang `Listen`
3. Kết quả SQL ở Phần 4 có `state = INVENTORY`, `generation = 1`, `unit_id = NULL`

👉 **Báo cho Hợp biết để Hợp dùng điện thoại quét mã QR trên màn hình ESP32, chọn Wi-Fi cho chip và nhận cửa.**
