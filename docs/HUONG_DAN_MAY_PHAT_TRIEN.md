# Smart Door — Nạp ESP32 và chạy dự án

Hướng dẫn cho dự án tại **`D:\DEV\IOT`** trên Windows PowerShell: nạp ESP32-S3, chạy backend, mở web admin và chạy mobile bằng Expo Go.

COM5 hiện đã xóa flash và nạp firmware sạch nhưng chưa được cấp phát danh tính. Để thử onboarding từ đầu, tạo factory bundle/QR mới theo mục 5.3; các lần chạy dịch vụ sau đó không cần nạp lại firmware.

## 1. Chuẩn bị

| Thành phần | Cấu hình của dự án |
| --- | --- |
| Phần cứng | ESP32-S3 N16R8, cổng hiện tại COM5 |
| Firmware đang sử dụng | `firmware/connected_door`, cấu hình `firmware/platformio.connected.ini` |
| Backend | Spring Boot, Maven; POM đặt Java 17, máy hiện tại dùng JDK 25 |
| Database | MySQL, cổng 3306, đã có DB và cấu hình riêng trên máy này |
| Broker MQTT | Mosquitto riêng của dự án, cổng 1884 |
| Web admin | Build từ `admin-web`, phục vụ cùng backend ở cổng 8080 |
| Mobile | `IOT_mobile`, Expo SDK 58, Expo Go Android tương thích SDK 58 |
| Node | Script ưu tiên Node 26 cục bộ trong `.local/node-runtime`; yêu cầu phiên bản xem `IOT_mobile/package.json` |
| Mạng điện thoại | Tailscale cùng tailnet với máy tính, được phép truy cập cổng 8080 và 8081 |

Máy hiện tại đã có môi trường và dependency. Nếu chuyển sang máy khác, cần cài công cụ, tạo cấu hình riêng và chỉnh đường dẫn trước; các file trong `.local` và `.env` không đi kèm Git.

Các đường dẫn công cụ đang dùng:

```text
PlatformIO: C:\Users\ACER\.platformio\penv\Scripts\pio.exe
Python USB: C:\Users\ACER\.platformio\penv\Scripts\python.exe
Python DB:  D:\DEV\IOT\.local\venv\Scripts\python.exe
Mosquitto:  D:\ACER\Mosquitto\mosquitto.exe
```

### Cấu hình mạng hiện tại

| Địa chỉ | Dùng cho |
| --- | --- |
| `100.111.90.116` | IP Tailscale của máy tính; app/điện thoại truy cập dịch vụ |
| `10.18.1.15` | IP LAN đã cấu hình cho broker mà ESP32 kết nối trong bản demo |
| `192.168.4.1` | Trang thiết lập nằm trên ESP32 khi điện thoại nối Wi-Fi SmartDoor |

IP LAN có thể đổi theo DHCP. Trước khi thử cửa, kiểm tra IP máy tính bằng `ipconfig`. Các IP trên là cấu hình hiện tại, không phải địa chỉ cố định cho mọi nơi lắp.

Trong bản demo, **ESP32 và máy tính chạy broker cần cùng LAN có thể truy cập nhau**. Tailscale trên điện thoại giúp điện thoại vào dịch vụ; ESP32 không tự tham gia Tailscale. Triển khai khác LAN cần broker TLS/dịch vụ Internet hoặc mạng định tuyến được thiết lập riêng. Xem [hướng dẫn triển khai](docs/HUONG_DAN_TRIEN_KHAI.md).

## 2. Chạy backend và broker

Giữ MySQL hoạt động. Mở **hai cửa sổ PowerShell riêng**, chạy broker trước rồi backend. Giữ các cửa sổ mở.

### Cửa sổ 1 — Broker MQTT

```powershell
cd D:\DEV\IOT
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-local.ps1 -Component broker
```

Broker dùng `.local/mosquitto/mosquitto.conf`, lắng nghe cổng **1884**.

### Cửa sổ 2 — Backend

```powershell
cd D:\DEV\IOT
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-local.ps1 -Component backend
```

Script đọc `smart-access-control-backend/.env`, sao chép JAR đã build vào `.local` rồi chạy. Chờ Spring Boot khởi động xong.

Kiểm tra tại máy tính: [http://localhost:8080/api/health](http://localhost:8080/api/health). Phản hồi sẵn sàng có `status: READY`.

Nếu báo không tìm thấy JAR hoặc vừa sửa code backend, build theo [mục 6](#6-build-lại-khi-sửa-code) rồi chạy lại lệnh trên. Khởi động hằng ngày không cần chạy lại script bootstrap hoặc reset DB.

## 3. Chạy web admin

**Không cần một terminal/server riêng cho admin trong cấu hình hiện tại.** Sau khi backend chạy, mở:

- Trên chính máy tính: [http://localhost:8080/admin/index.html](http://localhost:8080/admin/index.html).
- Máy khác trong Tailscale: [http://100.111.90.116:8080/admin/index.html](http://100.111.90.116:8080/admin/index.html).

Thông tin đăng nhập admin được lưu riêng trong [`.local/ADMIN_ACCESS.txt`](.local/ADMIN_ACCESS.txt). README không chứa mật khẩu.

Admin quản lý tài khoản và danh mục thiết bị. Chủ cửa dùng mobile để quản lý thành viên và quyền của cửa.

Trang admin nạp thiết bị bằng **Web Serial trên máy đang mở trình duyệt**. Dùng Chrome/Edge desktop qua HTTPS hoặc localhost, cắm chip vào máy này rồi bấm **Nạp code → Chọn cổng USB** và cấp quyền lần đầu. Những lần sau trang tìm lại các cổng đã cấp quyền. Backend có thể chạy trên máy khác; xem [luồng sản phẩm](LUONG_SAN_PHAM.md). Công cụ CLI ở [mục 5.3](#53-cấp-phát-một-chip-mới-trước-khi-giao) vẫn là đường dự phòng.

## 4. Chạy mobile bằng Expo Go

Mở **cửa sổ PowerShell thứ ba**:

```powershell
cd D:\DEV\IOT
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-local.ps1 -Component mobile
```

Script sử dụng `scripts/start-expo-go.ps1`, chọn IP từ `.local/runtime.json`, chuẩn bị model và chạy Expo ở cổng **8081**.

Trên điện thoại Android:

1. Bật Tailscale trên máy tính và điện thoại, kết nối cùng tailnet.
2. Mở Expo Go tương thích SDK 58.
3. Quét **QR trong terminal Expo** để tải ứng dụng. Có thể nhập `exp://100.111.90.116:8081` nếu Expo Go có mục mở URL.
4. Đăng ký tài khoản mới hoặc đăng nhập. Địa chỉ dịch vụ được cấu hình sẵn; người mua không nhập IP/backend.

Phân biệt hai QR:

| QR | Mục đích |
| --- | --- |
| QR ở terminal Expo | Mở app trong Expo Go |
| QR trên màn hình/tem sản phẩm | Nhận cửa vào tài khoản trong app |

Nếu cần đổi IP tải app, người phát triển có thể chạy trực tiếp:

```powershell
cd D:\DEV\IOT
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-expo-go.ps1 -PackagerAddress 100.111.90.116
```

Thay bằng IP thực khi cần. Tham số này chỉ chọn địa chỉ Expo; địa chỉ API trong `IOT_mobile/.env` do người triển khai cấu hình riêng. Sau khi sửa `.env`, dừng rồi khởi động lại Expo. `localhost` trên điện thoại chỉ chính điện thoại, không phải máy tính.

## 5. Nạp code vào ESP32-S3

### 5.1. Kiểm tra cổng và dây

1. Cắm ESP32-S3 bằng cáp USB có truyền dữ liệu.
2. Xem cổng trong Device Manager → Ports. Cổng hiện tại là **COM5**, máy khác có thể khác.
3. Đóng Serial Monitor hoặc công cụ đang giữ COM trước khi nạp/cấp phát.
4. Đối chiếu dây trong [tài liệu phần cứng](docs/integration.md).

Liệt kê thiết bị:

```powershell
& 'C:\Users\ACER\.platformio\penv\Scripts\pio.exe' device list
```

### 5.2. Build và nạp firmware đang dùng

Các lệnh dưới đây chạy trong thư mục `firmware`. **Chọn đúng `platformio.connected.ini`**, vì dự án còn có bản offline và bản bảo trì khác.

Build:

```powershell
cd D:\DEV\IOT\firmware
& 'C:\Users\ACER\.platformio\penv\Scripts\pio.exe' run -c platformio.connected.ini
```

Nạp:

```powershell
cd D:\DEV\IOT\firmware
& 'C:\Users\ACER\.platformio\penv\Scripts\pio.exe' run -c platformio.connected.ini -t upload --upload-port COM5
```

Nếu cổng khác, thay `COM5`. Kết quả thành công có `[SUCCESS]`. File ứng dụng được tạo tại `firmware/.pio/connected-door-build/esp32-s3-connected/firmware.bin`; PlatformIO tự xử lý các thành phần/địa chỉ nạp theo cấu hình board.

Upload firmware thông thường giữ NVS/danh tính đã cấp phát; không dùng erase flash khi chỉ cập nhật code. Erase flash sẽ xóa cả dữ liệu cấp phát và buộc chuẩn bị lại thiết bị.

Sau khi nạp firmware cho COM5 vừa xóa sạch, đọc trạng thái:

```powershell
cd D:\DEV\IOT
& 'C:\Users\ACER\.platformio\penv\Scripts\python.exe' .\scripts\device_tool.py --port COM5 info
```

Hiện trạng sạch có MAC `80B54EC8149C`, UID rỗng và `productPrepared=0`; Wi-Fi/PIN chưa có. Sau khi cấp phát mới, kết quả cần có UID và `productPrepared=1`.

Đọc log khi cần:

```powershell
& 'C:\Users\ACER\.platformio\penv\Scripts\pio.exe' device monitor --port COM5 --baud 115200
```

Thoát monitor trước khi dùng `device_tool.py` hoặc nạp tiếp.

### 5.3. Cấp phát một chip mới trước khi giao

Chỉ áp dụng cho chip mới/chưa có danh tính, không phải bước khởi động hằng ngày. Bên sản xuất làm bước này trước khi giao sản phẩm.

**Bước A — Đọc MAC tại máy đang cắm chip:**

```powershell
& 'C:\Users\ACER\.platformio\penv\Scripts\python.exe' `
  'C:\Users\ACER\.platformio\packages\tool-esptoolpy\esptool.py' `
  --chip esp32s3 --port COM5 read_mac
```

**Bước B — Đăng ký trên web admin:** vào **Đăng ký chip & QR**, nhập MAC vừa đọc và tên sản phẩm, tạo thiết bị. Tải JSON cấp phát ngay khi tạo và lưu QR. File chứa khóa riêng nên phải giữ ở phía sản xuất.

Tên file theo UID, ví dụ `ESP32-<MAC>.json`. Trong các lệnh bên dưới, thay `ESP32-MAC_CUA_CHIP` bằng UID thực được cấp, không nhập nguyên chuỗi ví dụ.

**Bước C — Tạo kết nối broker demo cho đúng UID:**

```powershell
cd D:\DEV\IOT
& .\.local\venv\Scripts\python.exe .\scripts\configure_local_device.py `
  --uid ESP32-MAC_CUA_CHIP --host 10.18.1.15
```

Thay host bằng IP LAN máy chạy broker mà ESP32 truy cập được. Script tạo `.local/<UID>-connection.json` và cập nhật tài khoản broker riêng của thiết bị. Dừng rồi chạy lại **broker dự án cổng 1884** để nạp danh sách tài khoản mới. Không thêm Wi-Fi của người mua khi xuất xưởng.

**Bước D — Nạp firmware** theo mục 5.2, sau đó ghi dữ liệu cấp phát. Giả sử JSON tải từ admin đã được lưu vào `.local`:

```powershell
cd D:\DEV\IOT
& 'C:\Users\ACER\.platformio\penv\Scripts\python.exe' .\scripts\device_tool.py `
  --port COM5 provision `
  --device .\.local\ESP32-MAC_CUA_CHIP.json `
  --connection .\.local\ESP32-MAC_CUA_CHIP-connection.json
```

File cấp phát phải có `factoryMac`, `deviceUid`, `generation`, `deviceSecret`, `activationCode`, `setupSsid`, `setupPassword`. File kết nối chứa cấu hình broker, không ghi đè các trường danh tính. Firmware kiểm tra đúng MAC và chỉ nhận cấp phát khi chưa có khóa thiết bị.

Thành công sẽ in `FACTORY_PROVISIONED <MAC>`, chip khởi động lại. Chạy `device_tool.py info` kiểm tra `productPrepared=1`, sau đó in/dán QR sản phẩm. UID/MAC công khai không thay thế mã nhận cửa hoặc khóa thiết bị.

### 5.4. Trạng thái sau khi nạp dữ liệu xuất xưởng

Ngày 06/11/2026, chip COM5 (MAC `80B54EC8149C`, UID `ESP32-80B54EC8149C`) đã nhận bộ cấp phát mới qua USB. Backend xác nhận mã kích hoạt hợp lệ; thiết bị trong kho đang ở trạng thái `INVENTORY`, generation 1.

`device_tool.py info` xác nhận `productPrepared=1`, `ui=WIFI_SETUP`, `setupStage=WIFI`, `appPins=0`, `templates=0`. Màn hình thiết lập có đủ danh tính để hiện QR sản phẩm và thông tin Wi-Fi thiết lập. Chưa cài Wi-Fi của người mua hoặc PIN admin.

| File trong `.local` | Vai trò hiện tại |
| --- | --- |
| `FACTORY_ESP32-80B54EC8149C.json` | Bộ cấp phát riêng đã nạp vào chip; không chia sẻ |
| `FACTORY_CONNECTION.json` | Cấu hình MQTT riêng cho thiết bị, broker `10.18.0.194:1884` |
| `PRODUCT_QR_ESP32-80B54EC8149C.png` | Tem QR sản phẩm khớp với mã kích hoạt vừa cấp |
| `ADMIN_ACCESS.txt` | Thông tin tài khoản admin |

Backend và broker dự án đã được dừng sau khi cấp phát. Khi thử app hoặc kết nối MQTT, khởi động lại các thành phần theo hướng dẫn ở mục 7.

## 6. Build lại khi sửa code

### Sửa backend hoặc admin

Web admin được build vào tài nguyên của backend, nên build admin **trước** khi đóng gói backend. Dừng backend đang chạy trước khi chạy lại bản mới.

Tại máy hiện tại, thêm Node cục bộ vào PATH của terminal nếu Node mặc định không phù hợp:

```powershell
cd D:\DEV\IOT
$env:Path = 'D:\DEV\IOT\.local\node-runtime;D:\DEV\IOT\.local\node-runtime\node_modules\node\bin;' + $env:Path
npm.cmd ci --prefix .\admin-web
npm.cmd run build --prefix .\admin-web
cd .\smart-access-control-backend
mvn.cmd clean package
```

Lệnh Maven chạy các kiểm thử theo cấu hình rồi tạo `target/smart-access-control-backend-0.0.1-SNAPSHOT.jar`. Chạy lại backend theo mục 2. Khi chỉ sửa Java, có thể bỏ bước build admin nếu tài nguyên admin đã có và không thay đổi.

### Sửa mobile

Nếu chỉ sửa mã nguồn, Expo ở chế độ tương tác sẽ cập nhật; reload app khi cần. Sau khi thay dependency hoặc cài trên máy khác:

```powershell
cd D:\DEV\IOT
$env:Path = 'D:\DEV\IOT\.local\node-runtime;D:\DEV\IOT\.local\node-runtime\node_modules\node\bin;' + $env:Path
cd .\IOT_mobile
npm.cmd ci
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
```

Sau đó chạy mobile theo mục 4. Không cần build APK để thử các chức năng được hỗ trợ trong Expo Go của dự án.

## 7. Thử vai người mua từ đầu

Trạng thái hiện tại: database chỉ giữ **một tài khoản admin**; chưa có thiết bị/cửa. COM5 đã xóa flash 16 MB, đã nạp firmware connected 1.4.0 và cảm biến vân tay đã xác nhận còn 0 mẫu. MAC/eFuse vẫn còn nhưng danh tính cấp phát, Wi-Fi, PIN và QR cũ đã bị xóa.

1. Chạy MySQL, broker, backend và mobile theo mục 2–4.
2. Đăng nhập web admin bằng tài khoản admin còn lại; mở **Đăng ký chip & QR**, đọc MAC qua COM5, tạo thiết bị mới và tải factory JSON/QR.
3. Tạo file kết nối broker mới theo mục 5.3, khởi động lại broker để nạp tài khoản mới, rồi chạy `device_tool.py provision` với hai file mới. Xác nhận `productPrepared=1` bằng lệnh `info`.
4. Trong app Expo Go, đăng ký tài khoản người dùng mới; chọn thêm thiết bị và quét QR mới vừa tạo. Không dùng QR/JSON cũ trong `.local`.
5. Kết nối Wi-Fi SmartDoor theo tên/mật khẩu trên màn hình cửa hoặc QR. Nếu captive portal không tự mở, vào **http://192.168.4.1**, chọn Wi-Fi nhà và hoàn tất kết nối.
6. Đưa điện thoại về mạng có Internet, nhận cửa trong app, đặt PIN và làm theo các bước hiệu chỉnh trên cửa.

**Trạng thái phần cứng:** cảm biến vân tay phản hồi và báo 0 mẫu; RC522 phản hồi sau reset. Servo/cảm biến cửa và luồng mở cửa chưa được kiểm tra sau lần xóa sạch này.

## 8. Dừng dự án và xử lý lỗi

Nhấn **Ctrl+C** trong từng cửa sổ broker, backend và Expo, chờ tiến trình thoát. Không cần tắt MySQL/Tailscale. Dừng dịch vụ không xóa DB hoặc firmware.

Kiểm tra cổng:

```powershell
netstat -ano -p tcp | Select-String ':(1884|8080|8081)\s+.*LISTENING'
```

| Hiện tượng | Kiểm tra |
| --- | --- |
| Cổng đang bị chiếm | Xác định PID đúng dịch vụ dự án, dừng terminal cũ rồi chạy lại; không dừng toàn bộ Java/Node trên máy |
| Backend không kết nối DB | MySQL có chạy không; kiểm tra DB_URL/DB_USERNAME/DB_PASSWORD trong backend `.env` |
| Không thấy thay đổi admin | Build admin, đóng gói lại JAR, khởi động lại backend và tải lại trang |
| Expo Go báo SDK không tương thích | Dự án dùng SDK 58; dùng Expo Go tương thích phiên bản này |
| Điện thoại không tải được app/API | Kiểm tra Tailscale, IP, cổng 8081/8080 và quyền truy cập; không dùng localhost của điện thoại |
| Cửa có Wi-Fi nhưng MQTT offline | Kiểm tra broker 1884, IP LAN, tài khoản riêng và firewall; IP Tailscale không mặc nhiên truy cập được từ ESP32 |
| Upload/đọc COM thất bại | Đóng Serial Monitor, kiểm tra cáp/cổng và driver; nếu board yêu cầu, giữ BOOT, nhấn RESET rồi thử nạp lại |
| `provision` không có xác nhận | Kiểm tra đúng firmware connected, đúng file/MAC; cửa đã cấp phát không nhận ghi đè danh tính qua lệnh này |
| Không nhận được cửa | Dùng mã nhận/QR mới, không nhập MAC/UID thay mã nhận; mã đã dùng không nhận lần hai |

Kiểm tra dịch vụ ở chế độ chỉ đọc, không tạo dữ liệu thử hoặc gửi lệnh mở:

```powershell
cd D:\DEV\IOT
& .\.local\venv\Scripts\python.exe .\scripts\verify-local.py
```

## 9. Tài liệu thêm

- [Luồng sản phẩm và người mua](docs/LUONG_SAN_PHAM.md).
- [Điều chỉnh nghiệp vụ sản xuất, reset và PIN trên app](docs/DIEU_CHINH_NGHIEP_VU_SAN_PHAM.md).
- [Triển khai, thêm thiết bị và camera nhận diện](docs/HUONG_DAN_TRIEN_KHAI.md).
- [Chạy nhanh trên máy hiện tại](docs/CHAY_DU_AN_LOCAL.md).
- [Kết quả và giới hạn kiểm thử](docs/KET_QUA_KIEM_THU.md).
- [Tổng quan kỹ thuật trước khi viết hướng dẫn này](docs/TONG_QUAN_KY_THUAT.md).

Face node không cần chạy để thử đăng ký tài khoản và nhận cửa. Muốn thử khuôn mặt, cấp phát camera node/cấu hình riêng theo tài liệu triển khai rồi chạy `scripts/start-local.ps1 -Component face` trong cửa sổ thứ tư. Khuôn mặt chỉ dùng khi online.
