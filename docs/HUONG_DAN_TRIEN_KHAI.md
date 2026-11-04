# Smart Door — triển khai và chuẩn bị sản phẩm

Luồng người mua mới nhất: [LUONG_SAN_PHAM.md](LUONG_SAN_PHAM.md). Người mua không nhập/đổi backend; địa chỉ dịch vụ do bên triển khai cấu hình trước khi phát hành app và nạp sản phẩm.

Mã nguồn gồm `smart-access-control-backend` (Spring Boot/MySQL), `IOT_mobile` (Expo, dùng chung cho User/Manager), `admin-web` (đóng gói vào backend), `firmware/connected_door` (ESP32-S3) và `face-node` (camera chạy trên máy tính).

## Mở hệ thống trên máy đang phát triển

Thông tin admin mới nằm trong `.local/ADMIN_ACCESS.txt` (file riêng, không commit). Không dùng mật khẩu trong các ghi chú demo cũ.

- Admin trên máy này: `http://127.0.0.1:8080/admin/index.html`.
- Admin qua Tailscale hiện tại: `http://100.111.90.116:8080/admin/index.html`.
- Mobile web: `http://100.111.90.116:8081`. Điện thoại cần đăng nhập cùng tailnet, được ACL của Tailscale cho phép tới máy này.
- App mở thẳng màn hình đăng nhập. Địa chỉ dịch vụ đã cấu hình sẵn trong bản phát hành; không có màn hình nhập/đổi backend cho người mua.
- Có thể mở dự án Expo trên thiết bị Android/iOS tương thích SDK 58. Bản native trên điện thoại cần kiểm thử riêng; kiểm tra web không chứng minh bản native đã hoạt động.

### Mở app Android bằng Expo Go 58

Dự án dùng Expo SDK 58, React Native 0.88 và React 19.3. Script khởi chạy ưu tiên Node 26 riêng trong `.local/node-runtime`; nếu không có, máy cần Node 22.13+, 24.3+ hoặc 26+. Node 25 không được SDK 58 hỗ trợ.

1. Cài [Expo Go cho Android / SDK 58](https://expo.dev/go?sdkVersion=58&platform=android&device=true). Nếu Expo Go đang báo SDK không tương thích, dùng đúng bản từ trang chính thức này.
2. Bật Tailscale trên điện thoại và máy tính, kết nối cùng tailnet.
3. Từ PowerShell chạy `powershell -ExecutionPolicy Bypass -File D:\DEV\IOT\scripts\start-expo-go.ps1`. Script chọn IP Tailscale trong `.local/runtime.json`, hiện QR và ép chế độ Expo Go (`--go`). Nếu đã có server chiếm 8081, nhấn Ctrl+C ở terminal server đó trước.
4. Trong Expo Go chọn quét QR của terminal hoặc nhập `exp://100.111.90.116:8081` ở mục mở URL. Đây là địa chỉ tải app, khác với địa chỉ backend.
5. Khi app mở, đăng nhập rồi quét QR trên sản phẩm. Dịch vụ và broker do người triển khai chạy ở các terminal riêng như bên dưới; người mua không cấu hình chúng.

Nếu chạy cùng Wi-Fi và không dùng Tailscale, truyền IP Wi-Fi thực của máy tính: `powershell -ExecutionPolicy Bypass -File scripts/start-expo-go.ps1 -PackagerAddress 10.18.1.15`. Người triển khai cấu hình EXPO_PUBLIC_API_BASE_URL trước khi chạy/phát hành app; không yêu cầu người mua nhập IP. Không dùng `localhost` trên điện thoại để chỉ máy tính.

Script cũng đặt đường dẫn tải model khuôn mặt theo đúng IP Metro. Điện thoại cần truy cập được cổng 8081 và 8080; quyền camera/thư viện sẽ hỏi khi sử dụng tính năng tương ứng. Không cần nạp lại firmware để đổi backend trên app.

Khởi chạy từng thành phần trong các terminal riêng từ `D:\DEV\IOT`:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-local.ps1 broker
powershell -ExecutionPolicy Bypass -File scripts/start-local.ps1 backend
powershell -ExecutionPolicy Bypass -File scripts/start-local.ps1 mobile
```

MySQL phải đang chạy. Các cấu hình riêng nằm trong backend `.env`, mobile `.env`, face-node `.env` và `.local`. Script khởi chạy backend dùng bản sao JAR trong `.local` để việc build không bị khóa file.

Sau khi thay code:

```powershell
cd admin-web
npm ci
npm run build
cd ../smart-access-control-backend
mvn test package
cd ../IOT_mobile
npm ci
npm run typecheck
npm run lint
npm test
```

Khởi động lại tiến trình backend/mobile do bạn chạy để tải bản mới. Không dừng toàn bộ Java/Node/Mosquitto trên máy vì có thể ảnh hưởng dự án khác.

## Kết nối mạng: Tailscale và cửa khác LAN

Điện thoại dùng Tailscale để tới backend. ESP32 **không chạy Tailscale**; firmware kết nối MQTT ra ngoài. IP LAN của backend không được ghi cứng vào firmware vận hành ngoài thực tế.

Demo cùng LAN: broker riêng trên máy này chạy cổng `1884`. Điền IPv4 Wi-Fi thực của máy tính vào file kết nối, ví dụ hiện tại `10.18.1.15`. Nếu DHCP đổi IP, cập nhật file và cấp phát lại khi thiết bị còn mới; cửa đã triển khai nên dùng broker TLS với DNS ổn định. Không nhập IP Tailscale `100.x` làm MQTT host của ESP32 nếu Wi-Fi nơi lắp không có router định tuyến tới tailnet.

Khác LAN: cần broker TLS có DNS mà cả ESP32 và backend đều truy cập được, hoặc một router/subnet router Tailscale được cấu hình riêng tại nơi lắp cửa. Bộ mã nguồn hiện cung cấp phương án broker TLS; subnet router chưa được triển khai ở đây. Chưa có broker/VPS nên chưa kiểm thử Internet khác LAN.

## Chuẩn bị thêm một ESP32 và cấp QR

1. Gắn thiết bị USB, xem cổng COM trong Device Manager. Không mặc định mọi thiết bị đều là COM5.
2. Trên web admin mở **Đăng ký chip & QR** → **Tìm cổng USB** → chọn cổng của ESP32-S3 (ví dụ COM5) → **Đọc MAC qua USB**. MAC tự điền vào form. USB phải cắm vào **máy đang chạy backend**; điện thoại/máy khác mở admin qua Tailscale vẫn đọc cổng của máy backend. Đóng Serial Monitor trước khi đọc. ESP32 sẽ khởi động lại; thao tác chỉ đọc, không xóa hoặc nạp firmware.

Script `scripts/start-local.ps1 backend` tự bật tính năng nếu tìm thấy Python/esptool của PlatformIO trên máy. Triển khai ở máy khác có thể cấu hình `USB_ENABLED=true`, `USB_PYTHON_EXECUTABLE` và `USB_ESPTOOL_SCRIPT` trong backend `.env`; Python cần có `pyserial`. Nếu không dùng USB trên backend, để `USB_ENABLED=false`. API `/api/admin/usb/*` chỉ dành cho admin; thao tác đọc dùng POST và CSRF.

Cách dự phòng bằng PowerShell:

```powershell
& 'C:\Users\ACER\.platformio\penv\Scripts\python.exe' `
  'C:\Users\ACER\.platformio\packages\tool-esptoolpy\esptool.py' `
  --chip esp32s3 --port COM5 read_mac
```

3. Admin vào **Đăng ký chip & QR**, nhập MAC và tên. Backend sinh UID `ESP32-<MAC>`, khóa thiết bị riêng và mã nhận cửa ngẫu nhiên dùng một lần. Chỉ biết MAC/UID không đủ để nhận cửa.
4. Tải file cấp phát USB ngay khi tạo. Giữ file này riêng; QR chỉ chứa mã kích hoạt, không chứa khóa thiết bị. In QR hoặc lưu mã để giao cho người mua.
5. Nạp firmware kết nối:

```powershell
cd D:\DEV\IOT\firmware
& 'C:\Users\ACER\.platformio\penv\Scripts\pio.exe' `
  run -c platformio.connected.ini --upload-port COM5 -t upload
```

6. Cho demo LAN, tạo tài khoản MQTT riêng có username đúng UID. Script sau dùng broker riêng của dự án, ghi mật khẩu vào file ignored và tạo connection JSON; không truyền mật khẩu trong command line:

```powershell
cd D:\DEV\IOT
& .local/venv/Scripts/python.exe scripts/configure_local_device.py `
  --uid ESP32-80B54EC8149C --host 10.18.1.15
```

Dừng rồi chạy lại **broker riêng cổng 1884** để tải password file mới. Backend tự kết nối lại. Nếu muốn thử Wi-Fi mở có thể thêm `--wifi-ssid PTIT_B2`; mặc định không ghi Wi-Fi của người dùng khi xuất xưởng.

7. Phía sản xuất ghi danh tính, mã nhận cửa/QR và kết nối dịch vụ vào chip trước khi giao. File cấp phát mới có activationCode và setupPassword; không dùng file cũ thiếu hai trường này:

```powershell
& 'C:\Users\ACER\.platformio\penv\Scripts\python.exe' scripts/device_tool.py `
  --port COM5 provision --device .local/ESP32-80B54EC8149C.json `
  --connection .local/ESP32-80B54EC8149C-connection.json
```

Thay đường dẫn `--device` bằng file vừa tải từ admin. Firmware so MAC trong file với eFuse thực, từ chối sai chip. Khóa được khóa lại sau lần ghi đầu; không ghi đè một cửa đã cấp phát bằng lệnh USB này.

8. Kiểm tra đọc trạng thái:

```powershell
& 'C:\Users\ACER\.platformio\penv\Scripts\python.exe' scripts/device_tool.py --port COM5 info
```

## Người mua kích hoạt bằng mobile

1. Mở app, đăng ký/đăng nhập tài khoản riêng. Địa chỉ dịch vụ đã có sẵn.
2. Chọn thêm cửa, quét QR hoặc nhập mã nhận cửa. Một mã chỉ dùng một lần.
3. Tại cửa, dùng trang NETWORK/SETUP trên TFT để xem SSID và mật khẩu mạng thiết lập. Điện thoại nối Wi-Fi này, mở `http://192.168.4.1`, nhập Wi-Fi nơi lắp. Wi-Fi mở để trống mật khẩu. Chỉ lưu khi kết nối thành công.
4. Chọn hoàn tất Wi-Fi trên trang cấu hình và mở lại ứng dụng. Hiệu chỉnh cảm ứng trên TFT, tạo PIN quản trị cục bộ và PIN cửa. PIN cục bộ không phải mật khẩu tài khoản.
5. Nối cảm biến từ. Bước hiệu chỉnh yêu cầu xác nhận **đóng**, rồi mở cửa/đưa nam châm ra xa và xác nhận **mở**. Không đổi tín hiệu thì không cho hoàn tất.
6. Đặt PIN mở cửa sáu số trên app. Chỉ có hiệu lực khi ESP32 ACK. Bấm kiểm tra hoàn tất; cửa chỉ ACTIVE khi cấu hình cục bộ và PIN backend đều hoàn tất.

## Dây nối đã dùng

| Bộ phận | ESP32-S3 |
|---|---|
| Servo SG90, tín hiệu | GPIO4 |
| Công tắc từ hai dây | GPIO6 và GND, dùng INPUT_PULLUP |
| UART vân tay | TX cảm biến → GPIO17, RX cảm biến ← GPIO18, 57600 baud |
| SPI chung | SCK41, MOSI42, MISO21 |
| RC522 | CS10, RST9, nguồn 3.3V |
| TFT | CS47, DC2, RST1 |
| Cảm ứng | CS48 |

Servo cần nguồn 5V đủ dòng và GND chung; kiểm tra góc khi chưa gắn cơ cấu tải. Nếu cảm biến từ có VCC/GND/DO, xác định mức điện áp DO trước khi nối GPIO; sơ đồ hai dây ở trên không áp dụng trực tiếp cho mọi module.

SG90 không cung cấp phản hồi vị trí chốt. ACK của ESP32 xác nhận lệnh điều khiển, không phải bằng chứng chốt đã di chuyển. Cảm biến từ chỉ phản ánh cánh cửa; nguồn servo/cơ cấu phải kiểm tra vật lý riêng.

## Thành viên và khuôn mặt

- Người dùng tự đăng ký tài khoản. Chủ cửa tìm email, gửi lời mời; người nhận chấp nhận trước khi cấp từng quyền RFID/vân tay/mở từ xa. Không tạo tài khoản dùng mật khẩu mặc định.
- Chủ cửa thêm vân tay bằng app: cảm biến lấy hai lần cùng ngón tay; chỉ tạo credential ACTIVE sau ACK. Danh sách thẻ/vân tay có nút thu hồi; xóa vân tay chờ ACK cảm biến.
- Người dùng vào hồ sơ khuôn mặt, chọn ảnh hoặc chụp. App trích đặc trưng 512 chiều; backend lưu đặc trưng dùng chung, không tải ảnh gốc vào endpoint lưu ảnh. Đăng ký một lần, gửi yêu cầu riêng cho từng cửa.
- Chủ cửa duyệt từng yêu cầu. Có ảnh/đặc trưng chưa đủ quyền mở. Thay hồ sơ khiến các quyền FACE cần duyệt lại.
- Camera chỉ mở khi node, backend, broker và controller online. Cấu hình không cho phép dùng FACE offline hoặc phát lại lệnh mở cũ.

Camera chạy trên máy tính/laptop riêng, không chạy nhận diện trực tiếp trên ESP32 này:

1. Chủ cửa mở cài đặt cửa → **Camera nhận diện online**, xác thực mật khẩu và cấp node. Lưu UID/secret hiển thị một lần vào `face-node/.env`.
2. Tạo MQTT account username đúng UID camera; LAN có thể dùng `scripts/configure_local_device.py --uid FACE-... --host <IP-PC>`. Sao chép thông tin broker vào `.env` bằng trình soạn thảo, không đưa secret lên Git.
3. Cấu hình `FACE_API_URL`, `FACE_DEVICE_UID`, `FACE_DEVICE_SECRET`, `MQTT_HOST`, `MQTT_PORT`, `MQTT_USERNAME`, `MQTT_PASSWORD`. Qua Internet bật `MQTT_TLS=true`, dùng CA tin cậy qua `MQTT_CA` nếu là CA riêng. Không tắt kiểm tra TLS.
4. Chạy `python node.py --camera` trong thư mục `face-node`, môi trường Python có dependencies từ requirements. Trọng số có sẵn trong `face-node/models`; điều khoản mô hình được ghi trong tài liệu mô hình của dự án. Giữ kiểm tra người thật bật.
5. Muốn gỡ camera, chủ cửa xác thực lại trong app. Secret cũ bị vô hiệu và camera không còn thuộc cửa.

## Reset / chuyển giao

Chủ cửa hoặc admin nhập lại mật khẩu, gõ đúng UID, chọn email người nhận nếu chuyển giao. Thiết bị phải online. Khi RESETTING, chặn lệnh khác. Backend chỉ dọn dữ liệu cửa khi ESP32 xác nhận đã xóa cảm biến và bộ nhớ người dùng.

Sau reset: PIN/Wi-Fi/cảm ứng/thẻ/vân tay/thành viên/lời mời/lịch sử của cửa bị xóa; thế hệ thiết bị tăng, lệnh cũ không dùng lại được. Tài khoản và hồ sơ khuôn mặt toàn cục vẫn thuộc người dùng. Danh tính xuất xưởng và kết nối broker được giữ để thiết bị vẫn là đúng sản phẩm đó. Mã cũ hết hiệu lực; người thực hiện/người nhận/admin xác thực để cấp mã mới. Mã chuyển giao chỉ được tài khoản nhận sử dụng.

Nếu mất mạng trước ACK, giao diện phải giữ trạng thái chờ; không coi việc gửi yêu cầu là đã reset xong. Lỗi cảm biến hoặc lỗi lưu trữ không được báo thành công.

## Broker TLS cho hai mạng khác nhau

Trong `infra/mosquitto`, có `compose.tls.yml`, `mosquitto.tls.conf`, ACL theo UID. Trên VPS do bạn chuẩn bị:

1. Trỏ DNS broker tới máy chủ; chỉ mở cổng 8883 cho MQTT TLS.
2. Tạo `private/certs/fullchain.pem` và `private/certs/privkey.pem` có chứng chỉ hợp lệ cho DNS đó, quyền đọc phù hợp với container. Theo dõi gia hạn chứng chỉ.
3. Tạo `private/passwords` bằng `mosquitto_passwd`: user `backend`, từng UID ESP32/camera một mật khẩu riêng. Không bật anonymous.
4. Chạy `docker compose -f compose.tls.yml up -d`. Cấu hình mẫu chưa được triển khai lên VPS và không thay thế việc kiểm tra chứng chỉ/firewall thực tế.
5. Backend dùng `MQTT_BROKER_URL=ssl://<DNS-broker>:8883`, username/password backend. CA công khai cần nằm trong truststore Java; CA riêng phải được nhập truststore riêng của ứng dụng.
6. Connection JSON cấp phát ESP32 dùng `mqttHost`, `mqttPort:8883`, `mqttUser`, `mqttPassword`, `mqttTls:true`, `mqttCa` là nội dung PEM CA tin cậy. Không bật `allowLocalPlaintext` trên Internet.
7. Thử ESP32 ở Wi-Fi A, backend ở Wi-Fi B, điện thoại dùng Tailscale. Kiểm tra ACK, ngắt mạng, kết nối lại, thu hồi quyền và reset. Chỉ sau bài thử này mới kết luận chạy được khác LAN.

Các tùy chọn TLS đối chiếu theo [tài liệu cấu hình Mosquitto](https://www.mosquitto.org/man/mosquitto-conf-5.html).

## Xóa dữ liệu demo và bàn giao

`scripts/reset_demo.py` chỉ thao tác database riêng có tên `smart_access_dev_*` ghi trong `.local/runtime.json`; phải truyền đúng `--confirm-database`. Script xóa dữ liệu nghiệp vụ và tạo một admin có mật khẩu ngẫu nhiên mới trong `.local/ADMIN_ACCESS.txt`, giữ migration. Nó không tự xóa cảm biến hoặc flash ESP32. Bình thường hãy kiểm chứng reset thiết bị trước khi dùng script này. Nếu chỉ dọn backend khi phần cứng không phản hồi, phải ghi rõ reset cảm biến chưa xác minh; không coi đó là reset toàn bộ thành công. Không chạy trên database khác.

Tệp kết quả kiểm thử riêng: `docs/KET_QUA_KIEM_THU.md`. Các mục chưa kiểm thử vật lý phải được hoàn thành trước khi lắp vào cửa sử dụng thực tế.
