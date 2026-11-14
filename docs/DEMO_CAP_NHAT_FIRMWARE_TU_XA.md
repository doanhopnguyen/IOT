# Demo cập nhật firmware từ xa: v2.0 demo

Bản mới nhất là **1.18.0 / 2.0.7-demo**. Từ 1.14.0 firmware có còi cảnh báo GPIO5 và ngưỡng sai PIN chỉnh trong app, xem [cách cài đặt và kết quả thử còi](COI_CANH_BAO.md). Từ 1.18.0, DOOR_LOCK từ app đưa servo về góc khóa ngay, xem [TU_KHOA_TRONG_APP.md](TU_KHOA_TRONG_APP.md). Các bản dùng cùng chức năng, chỉ khác màu nền nút.

## Các bản dùng trong demo

| Bản | Mục đích | Màu nền nút trên màn hình cửa |
|---|---|---|
| **1.18.0** | Bản cơ sở nạp qua USB; đã có OTA | Xanh dương (nền nút mặc định, quan sát trên chip thật) |
| **2.0.5-demo** | Bản OTA đã nạp lên chip bàn giao | Đen, chữ và viền trắng |
| **2.0.6-demo** | Bản OTA để đưa nút về nền mặc định sau 2.0.5 | Xanh dương (như bản cơ sở) |
| **2.0.7-demo** | Bản dùng để demo OTA: admin phát hành, chủ cửa đồng ý rồi cửa tự tải và khởi động lại | Đen, chữ và viền trắng |

Cả hai môi trường xanh dương (`esp32-s3-connected`, `esp32-s3-ota-red`) không bật cờ `FW_DEMO_BLACK_BUTTONS`, nên code tô nền bằng hằng `RED`. Màn hình hiển thị màu xanh dương, có thể do thứ tự màu RGB/BGR của màn hình; chưa xác minh nguyên nhân. Tên môi trường `ota-red` chỉ là tên lịch sử. Màu đen không bị ảnh hưởng.

Các bản cùng chức năng. OTA giữ PIN, thẻ, vân tay, Wi-Fi và cấu hình cửa. Việc xóa dữ liệu để bàn giao là thao tác riêng, không nằm trong cập nhật OTA.

Tệp để admin tải lên khi demo: [firmware-v2.0.7-demo.bin](../.local/releases/firmware-v2.0.7-demo.bin) (SHA-256 `485a1a75482a529ca40d1380eb8d4828301d7d07f1ddd63f074833d0ed407849`). Danh sách phiên bản, dung lượng và SHA-256: [firmware-manifest.json](../.local/releases/firmware-manifest.json). Chip đang chạy 2.0.6 thì cập nhật lên 2.0.7; OTA không cho hạ phiên bản.

> [!NOTE]
> Luồng mạng hiện hành (ESP32 nối thẳng broker và tải OTA qua Internet/HTTPS) theo bản bàn giao mới (ghi ch? n?i b?, ch? gi? c?c b? t?i `team-tailscale/HOP.md`). Mục 5 mô tả luồng này; các mục dùng IP LAN `10.18.0.194` ở tài liệu khác là bản cũ.

## 1. Mở hệ thống trên laptop

Mở PowerShell tại **`D:\DEV\IOT`**. Bật MySQL và Tailscale. Dùng **bốn cửa sổ PowerShell riêng**, mỗi cửa sổ chạy một lệnh và giữ mở:

```powershell
# Cửa sổ 1: MQTT
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-local.ps1 -Component broker
```

```powershell
# Cửa sổ 2: backend + web admin
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-local.ps1 -Component backend
```

```powershell
# Cửa sổ 3: xử lý ảnh đăng ký khuôn mặt
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-local.ps1 -Component face-api
```

```powershell
# Cửa sổ 4: app điện thoại bằng Expo Go
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-local.ps1 -Component mobile
```

Trên điện thoại bật Tailscale, mở Expo Go rồi nhập **`exp://100.111.90.116:8081`**. Nếu đã cài bản development build riêng, mở app theo hướng dẫn của bản đó.

Web admin: **http://100.111.90.116:8080/admin/index.html**. Trên chính laptop cũng dùng được **http://127.0.0.1:8080/admin/index.html**. Tài khoản admin cũ ở [ADMIN_ACCESS.txt](../.local/ADMIN_ACCESS.txt).

## 2. Chủ nhà thiết lập lại cửa

1. Cấp nguồn cho ESP32. Bản bàn giao đã có danh tính sản phẩm và mã QR; **không cần đăng ký chip trong admin**.
2. Trong app, đăng ký/đăng nhập **tài khoản chủ nhà thông thường**, chọn **Thêm thiết bị → Quét QR**. Quét QR trên cửa hoặc [ảnh QR sản phẩm](../.local/PRODUCT_QR_ESP32-80B54EC8149C.png).
3. Làm theo app để kết nối Wi-Fi cho cửa qua trang cấu hình của ESP32.
4. **Sau khi Wi-Fi đã lưu và kết nối thành công: nhấn RESET/EN hoặc rút nguồn rồi cấp lại.** Chờ cửa online, sau đó bấm xác nhận đã khởi động lại trong app.
5. Nhận cửa, đặt hai PIN khác nhau: PIN mở cửa và PIN quản trị.
6. Hoàn tất hiệu chỉnh cảm ứng, kiểm tra cảm biến cửa đóng/mở theo app và màn hình cửa. Luồng đăng ký mới không yêu cầu hiệu chỉnh góc servo. Khi cần chỉnh cơ khí, mở **Cài đặt thiết bị → Góc Servo** sau này.
7. Chờ thiết bị báo **Sẵn sàng/Hoạt động**. Có thể thêm thẻ/vân tay trước OTA để quan sát chúng vẫn còn sau cập nhật.

Không dùng tài khoản admin hệ thống để nhận cửa hoặc sử dụng cửa hằng ngày. QR là thông tin nhận sản phẩm; giữ ảnh riêng và không đăng công khai.

## 3. Admin cung cấp bản cập nhật

Thao tác trên **trình duyệt laptop**:

1. Mở trang admin ở bước 1 và đăng nhập tài khoản admin cũ.
2. Chọn **Cập nhật firmware** trên thanh bên.
3. Điền đúng:

   | Ô | Giá trị |
   |---|---|
   | Tên hiển thị | `v2.0.7 demo` |
   | Phiên bản firmware | `2.0.7-demo` |
   | Nội dung | `Đổi nền nút trên màn hình cửa sang đen. Giữ nguyên chức năng và dữ liệu cửa.` |
   | Tệp firmware | `D:\DEV\IOT\.local\releases\firmware-v2.0.7-demo.bin` |

4. Bấm **Phát hành cho chủ cửa**. Chờ thông báo phát hành thành công và bản demo xuất hiện trong danh sách phía dưới.

Admin phát hành cho các cửa dùng phần cứng `esp32s3-n16r8` có phiên bản thấp hơn. Admin không tự cài firmware lên cửa của chủ nhà. Phiên bản đã phát hành không được thay tệp hoặc phát hành trùng; phiên bản nhập phải khớp tệp `.bin`.

Để nạp chip mới từ web, phát hành kèm **factory image** (ô "Factory image" trong form; tệp `factory-<phiên bản>.bin` do `scripts/build-firmware.ps1` sinh). Thêm thiết bị và nạp code: xem bước 7.

## 4. Chủ nhà nhận và cài đặt

Thao tác trên **app điện thoại**:

1. Mở cửa đang quản lý. Trong khoảng 15 giây app sẽ hiện **Có bản cập nhật cho cửa**.
2. Bấm **Xem bản cập nhật**. Hoặc vào **Cài đặt thiết bị → Cập nhật**.
3. Đọc nội dung **v2.0.7 demo**, kiểm tra phiên bản hiện tại (**2.0.6-demo** nếu chip đang chạy bản này).
4. Đóng cửa, giữ nam châm đúng vị trí cảm biến đóng và chờ chốt khóa đứng yên.
5. Bấm **Cập nhật v2.0.7 demo → Đồng ý cập nhật**.
6. Giữ nguồn điện và Wi-Fi. Màn hình cửa báo tiến độ; thao tác điều khiển cửa tạm dừng trong thời gian ghi firmware. Cửa tự khởi động lại khi tải và kiểm tra tệp xong.
7. Chờ app báo **Cập nhật thành công**, phiên bản **2.0.7-demo**. Quan sát nền các nút trên màn hình cửa đã chuyển từ xanh dương sang đen.
8. Thử lại PIN/thẻ/vân tay đã thêm và các thao tác cửa thường dùng. Dữ liệu này phải còn sau OTA.

App chỉ báo hoàn tất khi nhận xác nhận sau khởi động và thiết bị báo đúng phiên bản mới. Nếu cửa đang mở, thiết bị từ chối cập nhật và app hướng dẫn đóng cửa để thử lại. Nếu tải lỗi hoặc SHA-256 không khớp, thiết bị hủy bản tải; không chọn bản tải lỗi để khởi động.

## 5. Tailscale và địa chỉ tải firmware

Theo bản bàn giao 09/11 (ghi ch? n?i b?, ch? gi? c?c b? t?i `team-tailscale/HOP.md`), ESP32 **không còn đi qua gateway LAN** và không cần cùng mạng với backend. Chip kết nối thẳng broker máy Cường qua Internet bằng TLS, và tải firmware qua HTTPS:

```text
App → Backend máy Cường → MQTT (TLS) → ESP32
ESP32 → HTTPS → tải firmware → kiểm tra SHA-256 → khởi động lại
```

| Thành phần | Địa chỉ |
|---|---|
| MQTT broker (TLS) | `desktop-s2r046u.tailad91e1.ts.net:8443` |
| Tải firmware (OTA) | ````````````````````````````````````````````````````````````````````````````````````````````````````````````````````````````````````````````````````````````````````````````````````` (cổng 443) |

Backend trên máy Cường phải đặt:

```text
APP_DEVICE_BASE_URL=https://desktop-s2r046u.tailad91e1.ts.net
```

Lưu ý:
- ESP32 dùng Wi-Fi nào có Internet cũng được, miễn truy cập được cổng 8443 và 443 của máy Cường. Máy Cường phải bật trong lúc demo.
- Firmware chỉ chấp nhận URL HTTP khi host là địa chỉ riêng. URL công cộng phải là HTTPS và chip phải có CA đã provision (`ts-ca.pem`); thiếu CA thì báo `OTA_TLS_CA_REQUIRED`.
- Không đặt `APP_DEVICE_BASE_URL` là `localhost`, `127.0.0.1` hoặc IP Tailscale cho ESP32.
- Đổi `APP_DEVICE_BASE_URL` cần khởi động lại backend. URL dùng chung cho cả đợt demo; chưa cấu hình OTA riêng cho nhiều site.
- Kiểm tra trước demo (tắt Tailscale trên laptop để thử như ESP32): `Test-NetConnection desktop-s2r046u.tailad91e1.ts.net -Port 8443` và `-Port 443` đều phải `TcpTestSucceeded : True`.
- Tài liệu cũ dùng IP LAN `10.18.0.194` và `scripts/mqtt_gateway.py` mô tả luồng gateway trước ngày 09/11; không dùng cho luồng hiện hành.

## 6. Build lại các tệp demo

Tại `D:\DEV\IOT`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-ota-demo.ps1
```

Lệnh chỉ build và tạo tệp trong `.local/releases`; không nạp chip hoặc xóa dữ liệu. Khi cần đưa một cửa đã cài demo về bản cơ sở 1.18.0 (nền nút xanh dương) để biểu diễn lại, kỹ thuật viên nạp bản cơ sở qua USB; OTA hiện không cho hạ phiên bản. Không chạy các lệnh reset dữ liệu mỗi lần mở dự án.

## 7. Chỉ dành cho cấp phát một chip mới

Chip đang bàn giao đã được làm bước này.

**Đường chính (web admin, Web Serial):** Mở admin bằng Chrome/Edge desktop qua HTTPS hoặc localhost. Thêm thiết bị → cắm ESP32-S3 vào **máy đang mở admin** → **Nạp code** ở dòng thiết bị → **Chọn cổng USB**, cấp quyền lần đầu → chọn bản firmware có factory image, nhập lại mật khẩu → chờ các bước ✓ → in QR. Những lần sau trang tự tìm các cổng đã cấp quyền. Backend có thể ở máy khác hoặc Docker, không cần bật USB/Python/esptool cho luồng này; vẫn cần `PROVISION_MQTT_HOST` (địa chỉ broker ESP32 truy cập được). Broker phải chạy plugin dynamic security (`scripts/bootstrap_local.py broker` hoặc `deployment/team`). Giữ trang mở khi nạp. Nếu mất mạng sau khi chip đã xác nhận, dùng **Xác nhận hoàn tất** để thử lưu lại kết quả. Chi tiết tại [luồng sản phẩm](LUONG_SAN_PHAM.md).

**Đường dự phòng (backend chạy Docker, không thấy USB):**

```powershell
.\.local\venv\Scripts\python.exe scripts/register_local_device.py --mac 80B54EC8149C --name "Smart Door"
```

Backend tự tạo tài khoản MQTT và trả file kết nối (không cần restart broker), rồi cấp phát USB (đổi UID/COM đúng chip):

```powershell
& "$env:USERPROFILE\.platformio\penv\Scripts\python.exe" scripts/device_tool.py --port COM5 provision --device .local/FACTORY_ESP32-80B54EC8149C.json --connection .local/ESP32-80B54EC8149C-connection.json
node scripts/make-product-qr.cjs .local/FACTORY_ESP32-80B54EC8149C.json
```

Đợi `FACTORY_PROVISIONED` trước khi giao sản phẩm. File factory/connection có bí mật thiết bị, chỉ dùng cho cấp phát; chủ nhà chỉ cần QR sản phẩm.

Luồng laptop AI sau khi nhận cửa: [DEMO_AI_TREN_LAPTOP.md](DEMO_AI_TREN_LAPTOP.md).
