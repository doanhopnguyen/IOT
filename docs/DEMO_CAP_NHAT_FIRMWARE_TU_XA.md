# Demo cập nhật firmware từ xa: v2.0 demo

Bản mới nhất **1.14.0 / 2.0.1-demo** đã bổ sung còi cảnh báo GPIO5 và ngưỡng sai PIN chỉnh trong app. Xem [cách cài đặt và kết quả thử còi](COI_CANH_BAO.md). Hai bản dùng cùng chức năng cảnh báo, khác màu nền nút.

## Bạn dùng hai bản nào?

| Bản | Mục đích | Màu nền nút trên màn hình cửa |
|---|---|---|
| **1.14.0** | Bản cơ sở được nạp lại trước khi bàn giao; đã có OTA | Đỏ |
| **2.0.1-demo**, tên **v2.0 demo** | Admin phát hành, chủ cửa đồng ý rồi cửa tự tải và khởi động lại | Đen, chữ và viền trắng |

Hai bản cùng chức năng. OTA giữ PIN, thẻ, vân tay, Wi-Fi và cấu hình cửa. Việc xóa dữ liệu để bàn giao là thao tác riêng, không nằm trong cập nhật OTA.

Tệp để admin tải lên: [firmware-v2.0.1-demo.bin](../.local/releases/firmware-v2.0.1-demo.bin). Danh sách phiên bản, dung lượng và SHA-256: [firmware-manifest.json](../.local/releases/firmware-manifest.json).

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
   | Tên hiển thị | `v2.0 demo` |
   | Phiên bản firmware | `2.0.1-demo` |
   | Nội dung | `Thêm còi cảnh báo sai PIN và cửa mở lâu, đồng bộ ngưỡng từ app. Giữ nền nút đen và dữ liệu cửa.` |
   | Tệp firmware | `D:\DEV\IOT\.local\releases\firmware-v2.0.1-demo.bin` |

4. Bấm **Phát hành cho chủ cửa**. Chờ thông báo phát hành thành công và bản demo xuất hiện trong danh sách phía dưới.

Admin phát hành cho các cửa dùng phần cứng `esp32s3-n16r8` có phiên bản thấp hơn. Admin không tự cài firmware lên cửa của chủ nhà. Phiên bản đã phát hành không được thay tệp hoặc phát hành trùng; phiên bản nhập phải khớp tệp `.bin`.

Giao diện admin đã bỏ **Đăng ký chip & QR**, nút đăng ký chip và nút cấp QR trong danh sách thiết bị. Cấp phát sản phẩm mới dành cho công cụ kỹ thuật ở bước 7 bên dưới.

## 4. Chủ nhà nhận và cài đặt

Thao tác trên **app điện thoại**:

1. Mở cửa đang quản lý. Trong khoảng 15 giây app sẽ hiện **Có bản cập nhật cho cửa**.
2. Bấm **Xem bản cập nhật**. Hoặc vào **Cài đặt thiết bị → Cập nhật**.
3. Đọc nội dung **v2.0 demo**, kiểm tra phiên bản hiện tại **1.14.0**.
4. Đóng cửa, giữ nam châm đúng vị trí cảm biến đóng và chờ chốt khóa đứng yên.
5. Bấm **Cập nhật v2.0 demo → Đồng ý cập nhật**.
6. Giữ nguồn điện và Wi-Fi. Màn hình cửa báo tiến độ; thao tác điều khiển cửa tạm dừng trong thời gian ghi firmware. Cửa tự khởi động lại khi tải và kiểm tra tệp xong.
7. Chờ app báo **Cập nhật thành công**, phiên bản **2.0.1-demo**. Quan sát nền các nút trên màn hình cửa đã chuyển từ đỏ sang đen.
8. Thử lại PIN/thẻ/vân tay đã thêm và các thao tác cửa thường dùng. Dữ liệu này phải còn sau OTA.

App chỉ báo hoàn tất khi nhận xác nhận sau khởi động và thiết bị báo đúng phiên bản mới. Nếu cửa đang mở, thiết bị từ chối cập nhật và app hướng dẫn đóng cửa để thử lại. Nếu tải lỗi hoặc SHA-256 không khớp, thiết bị hủy bản tải; không chọn bản tải lỗi để khởi động.

## 5. Tailscale và địa chỉ tải firmware

Điện thoại và admin có thể truy cập backend qua Tailscale. **ESP32 không có Tailscale**, nên tệp firmware phải tải qua địa chỉ LAN mà chip truy cập được.

Trên laptop hiện tại đã cấu hình:

```text
APP_DEVICE_BASE_URL=http://10.18.0.194:8080
```

Bản demo mặc định dùng cửa và máy backend cùng LAN. Cho phép TCP 8080 từ LAN tới laptop. Nếu đổi Wi-Fi/IP laptop, dừng backend rồi chạy, thay IP bằng IPv4 LAN mới:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/configure-network.ps1 -Role server -LanAddress 10.18.0.194
```

Sau đó khởi động lại backend. Cấu hình MQTT trên chip cũng phải trỏ đúng gateway LAN hiện tại. Không đặt `APP_DEVICE_BASE_URL` là `localhost`, `127.0.0.1` hoặc IP Tailscale cho ESP32.

Nếu cửa ở LAN khác, cần gateway chuyển tiếp **cả MQTT 1884 và HTTP tải firmware 8080** qua Tailscale. Script TCP hiện có dùng được cho cổng tải, chạy thêm trên gateway ở LAN cửa, ví dụ:

```powershell
python scripts/mqtt_gateway.py --listen 192.168.1.20 --listen-port 8080 --server 100.111.90.116 --server-port 8080
```

Cho phép cổng 8080 từ LAN trên gateway và đặt `APP_DEVICE_BASE_URL=http://192.168.1.20:8080` trên backend rồi khởi động lại. Cấu hình URL này dùng chung cho đợt demo: phải chọn địa chỉ mọi cửa trong đợt cập nhật đều truy cập được. Chỉ có gateway MQTT thì cửa vẫn điều khiển được nhưng chưa tải được firmware qua HTTP. Chưa cấu hình phân phối OTA riêng cho nhiều site có URL khác nhau.

## 6. Build lại hai tệp demo

Tại `D:\DEV\IOT`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-ota-demo.ps1
```

Lệnh chỉ build và tạo tệp trong `.local/releases`; không nạp chip hoặc xóa dữ liệu. Khi cần đưa một cửa đã cài demo về bản đỏ 1.14.0 để biểu diễn lại, kỹ thuật viên nạp bản cơ sở qua USB; OTA hiện không cho hạ phiên bản. Không chạy các lệnh reset dữ liệu mỗi lần mở dự án.

## 7. Chỉ dành cho cấp phát một chip mới

Chip đang bàn giao đã được làm bước này. Với chip khác đã nạp bản cơ sở, công cụ kỹ thuật vẫn dùng API cấp phát được bảo vệ bằng quyền admin; phần này không nằm trong giao diện admin.

```powershell
.\.local\venv\Scripts\python.exe scripts/register_local_device.py --mac 80B54EC8149C --name "Smart Door" --mqtt-host 10.18.0.194
```

Khởi động lại **broker dự án 1884** để nạp tài khoản MQTT mới, rồi cấp phát USB (đổi UID/COM đúng chip):

```powershell
& "$env:USERPROFILE\.platformio\penv\Scripts\python.exe" scripts/device_tool.py --port COM5 provision --device .local/FACTORY_ESP32-80B54EC8149C.json --connection .local/ESP32-80B54EC8149C-connection.json
node scripts/make-product-qr.cjs .local/FACTORY_ESP32-80B54EC8149C.json
```

Đợi `FACTORY_PROVISIONED` trước khi giao sản phẩm. File factory/connection có bí mật thiết bị, chỉ dùng cho cấp phát; chủ nhà chỉ cần QR sản phẩm.

Luồng laptop AI sau khi nhận cửa: [DEMO_AI_TREN_LAPTOP.md](DEMO_AI_TREN_LAPTOP.md).
