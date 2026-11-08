# Chạy lại toàn bộ dự án sau reset, dùng Tailscale

**Cập nhật 08/11/2026:** bản bàn giao OTA dùng firmware cơ sở **1.14.0**, đã chuẩn bị danh tính và QR sản phẩm mới. Bắt đầu theo [hướng dẫn demo OTA và chạy lại bằng QR có sẵn](DEMO_CAP_NHAT_FIRMWARE_TU_XA.md); bỏ qua các bước đăng ký chip/cấp QR cũ trong tài liệu này. Giao diện admin hiện chỉ phát hành firmware và quản trị hệ thống, không có đăng ký chip/QR.

Áp dụng cho máy `D:\DEV\IOT`, chip COM5, MAC `80:B5:4E:C8:14:9C`, ngày 07/11/2026. Làm lần lượt các bước dưới đây. Các lệnh đều chạy trong PowerShell tại thư mục dự án.

Đã rà soát chuyển trạng thái mobile/admin với backend và dọn lại dữ liệu sau đợt kiểm thử mới nhất. Xem [báo cáo kiểm thử và giới hạn phần cứng đã xác nhận](RA_SOAT_VA_KIEM_THU_HE_THONG_2026-11-07.md). Đây là hướng dẫn cho trạng thái sạch hiện tại; các QR hoặc tài khoản thường dùng trong kiểm thử đã xóa.

## 1. Trạng thái đã chuẩn bị

- Database chỉ giữ tài khoản admin cũ, giữ nguyên ID và mật khẩu. Tài khoản thường, cửa, thiết bị, thẻ, vân tay, khuôn mặt, lịch sử và lệnh đã xóa.
- ESP32 đã xóa toàn bộ flash và nạp firmware tích hợp **1.11.0**. Wi-Fi, PIN, cấu hình servo và danh tính cấp phát cũ đã xóa. Cảm biến vân tay xác nhận **0 mẫu**.
- Đã dọn các bản sao flash/DB và file cấp phát cũ trong danh sách dọn của dự án. QR và file cấp phát cũ không dùng lại.
- Đã dừng dịch vụ dự án trên các cổng **1884, 8080, 8081, 8091, 8092**. MySQL, Tailscale và Mosquitto hệ thống 1883 vẫn được giữ.
- Firmware, web admin và backend đã build. Không cần nạp lại firmware hoặc cài dependency để làm các bước này.

Mở `.local/ADMIN_ACCESS.txt` trên máy để xem thông tin đăng nhập admin. Giữ file này riêng tư. Admin hệ thống dùng cấp phát chip; sau đó tạo tài khoản thường làm chủ cửa trên app.

## 2. Bật Tailscale và kiểm tra mạng

Máy chủ và điện thoại đăng nhập cùng tailnet. Nếu dùng laptop AI hoặc gateway ở mạng khác, bật Tailscale trên máy đó nữa. Trên máy chủ:

```powershell
cd D:\DEV\IOT
& 'C:\Program Files\Tailscale\tailscale.exe' ip -4
Get-NetIPAddress -AddressFamily IPv4 | Select-Object InterfaceAlias,IPAddress
```

Địa chỉ đã kiểm tra của máy hiện tại:

| Mục | Địa chỉ |
|---|---|
| API | `http://100.111.90.116:8080` |
| Trang admin | `http://100.111.90.116:8080/admin/index.html` |
| Expo Go trên điện thoại | `exp://100.111.90.116:8081` |
| MQTT qua Tailscale | `100.111.90.116:1884` |
| IP LAN của máy chủ | `10.18.0.194` |
| Portal Wi-Fi trên ESP32 | `http://192.168.4.1` khi điện thoại nối AP của chip |

Nếu đổi Wi-Fi máy chủ, lấy IP LAN mới rồi cập nhật trước khi đăng ký chip:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/configure-network.ps1 -Role server -LanAddress 10.18.0.194
```

Thay `10.18.0.194` bằng IP LAN thực tế nếu khác. Nếu IP Tailscale thay đổi, dùng IP mới trong URL và lệnh bên dưới. Máy đã có rule Windows Firewall cho Smart Door LAN và Tailscale. Khi cần tạo lại rule, chạy lệnh sau trong PowerShell **Run as Administrator**:

```powershell
cd D:\DEV\IOT
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/configure-network.ps1 -Role server -LanAddress 10.18.0.194 -Firewall
```

Quyền truy cập của tailnet phải cho điện thoại đến TCP 8080/8081 và gateway/AI đến TCP 1884. Không cần chuyển tiếp cổng trên router Internet. Đọc thêm [hướng dẫn truy cập từ xa của Tailscale](https://tailscale.com/docs/how-to/set-up-remote-access).

**Chọn đường MQTT cho ESP32 trước bước 4:**

- **Chip cùng Wi-Fi/LAN máy chủ:** dùng MQTT host `10.18.0.194`. Máy chủ chính là điểm nhận MQTT của chip.
- **Chip ở mạng khác:** cần máy gateway cùng LAN với chip. Máy gateway có Tailscale và chạy script ở bước 6. MQTT host cấp cho chip là IP LAN của gateway đó, ví dụ `192.168.1.20`.

ESP32 trong dự án không chạy Tailscale; không ghi IP `100.x` vào MQTT host của chip. Điện thoại qua Tailscale không tự làm ESP32 ở mạng khác kết nối được. Máy chủ/gateway phải luôn bật và không sleep khi sử dụng.

## 3. Cửa sổ PowerShell 1: chạy backend trước

```powershell
cd D:\DEV\IOT
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-local.ps1 -Component backend
```

Giữ cửa sổ mở. Chờ backend chạy xong rồi mở:

```text
http://100.111.90.116:8080/api/health
```

Kết quả phải có `"application":"smart-door"` và `"status":"READY"`. Lúc này MQTT chưa chạy nên log thử kết nối lại broker là bình thường. Mở trang admin bằng địa chỉ trong bảng, đăng nhập admin cũ. Chưa có cửa hay thiết bị là đúng sau reset.

## 4. Cửa sổ lệnh phụ: đăng ký chip và chuẩn bị tài khoản MQTT

Chip đã nạp firmware nhưng chưa có danh tính mới. Cắm USB, đóng Serial Monitor. Với chip cùng LAN máy chủ, chạy:

```powershell
cd D:\DEV\IOT
.\.local\venv\Scripts\python.exe scripts/register_local_device.py --mac 80:B5:4E:C8:14:9C --name 'Cua nha' --mqtt-host 10.18.0.194
```

Nếu chip ở mạng khác, thay riêng `--mqtt-host` bằng IP LAN gateway, ví dụ `192.168.1.20`. Không chạy cả đăng ký CLI và đăng ký mới trên web cho cùng một chip. Lệnh tạo:

```text
.local/FACTORY_ESP32-80B54EC8149C.json
.local/ESP32-80B54EC8149C-connection.json
```

Giữ cả hai file riêng tư. Nếu lệnh báo factory file đã tồn tại, dừng việc đăng ký mới và dùng đúng file đã tạo. Có thể dùng web admin để đăng ký thay CLI; khi đã tải factory từ admin, dùng `register_local_device.py --factory-file <duong-dan-file.json> --mqtt-host <IP-LAN>` để chuẩn bị MQTT, không đăng ký MAC lại.

## 5. Cửa sổ PowerShell 2: chạy MQTT, rồi cấp phát chip

Chỉ bắt đầu broker sau bước 4 để broker nạp tài khoản thiết bị vừa tạo:

```powershell
cd D:\DEV\IOT
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-local.ps1 -Component broker
```

Giữ cửa sổ này mở. Broker dự án dùng **1884**; dịch vụ Mosquitto 1883 là riêng. Nếu broker đã chạy trước khi thêm chip, Ctrl+C **riêng cửa sổ broker** rồi chạy lại lệnh trên. Backend tự kết nối lại.

Trở lại cửa sổ lệnh phụ và cấp phát qua USB:

```powershell
cd D:\DEV\IOT
& "$env:USERPROFILE\.platformio\penv\Scripts\python.exe" scripts/device_tool.py --port COM5 provision --device .local/FACTORY_ESP32-80B54EC8149C.json --connection .local/ESP32-80B54EC8149C-connection.json
```

Phải nhận **`FACTORY_PROVISIONED`**. Sau đó màn hình chip hiển thị QR/mạng thiết lập của sản phẩm. Không nạp factory lần nữa sau khi thành công. Kiểm tra khi cần:

```powershell
& "$env:USERPROFILE\.platformio\penv\Scripts\python.exe" scripts/device_tool.py --port COM5 info
```

`uid` phải là `ESP32-80B54EC8149C`, `productPrepared=1`. Chưa chọn Wi-Fi thì `savedWifi=0`, `claimed=0` là bình thường. Nếu COM thay đổi, xem Device Manager hoặc `Get-CimInstance Win32_SerialPort` và thay COM trong lệnh.

## 6. Chỉ khi chip ở mạng khác: chạy gateway

Bỏ qua bước này nếu chip cùng LAN máy chủ. Trên máy gateway cùng Wi-Fi/LAN với ESP32, bật Tailscale cùng tailnet. Sao chép `scripts/mqtt_gateway.py` sang máy gateway nếu chưa có dự án, rồi chạy bằng Python:

```powershell
python scripts/mqtt_gateway.py --server 100.111.90.116 --check
python scripts/mqtt_gateway.py --listen 192.168.1.20 --server 100.111.90.116
```

Thay `192.168.1.20` bằng IP LAN thật của gateway và giữ lệnh chạy. Cho phép TCP 1884 từ LAN vào gateway; Wi-Fi không bật cách ly thiết bị/guest isolation. Nên cố định IP gateway trong DHCP của router. Không chạy thêm gateway tại máy chủ trùng cổng broker 1884.

Script chuyển tiếp TCP MQTT qua Tailscale, mỗi chip vẫn xác thực bằng tài khoản riêng. Đây là cách của dự án; không yêu cầu bật subnet routing. [Subnet router](https://tailscale.com/docs/features/subnet-routers) là lựa chọn khác cho thiết bị không cài được Tailscale.

## 7. Cửa sổ PowerShell 3: dịch vụ xử lý khuôn mặt

```powershell
cd D:\DEV\IOT
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-local.ps1 -Component face-api
```

Chờ `Face enrollment processor ready on 127.0.0.1:8091`. Dịch vụ này xử lý ảnh/video đăng ký từ backend, chưa bật camera nhận diện. Không cần mở 8091 ra Tailscale.

## 8. Cửa sổ PowerShell 4: chạy app bằng Expo Go

```powershell
cd D:\DEV\IOT
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-local.ps1 -Component mobile
```

Điện thoại bật Tailscale, cài Expo Go tương thích Expo SDK 58. Quét QR terminal bằng Expo Go hoặc mở:

```text
exp://100.111.90.116:8081
```

QR terminal mở app; QR trên chip dùng nhận cửa bên trong app. Trên điện thoại, thử hai URL nếu chưa vào được:

```text
http://100.111.90.116:8080/api/health
http://100.111.90.116:8081/status
```

URL thứ hai phải trả `packager-status:running`. Nếu máy chủ mở được nhưng điện thoại không mở được, kiểm tra Tailscale trên điện thoại, quyền tailnet và Firewall. Không đổi API sang `localhost` trên điện thoại. Xem [xử lý lỗi Expo Go](CHAY_EXPO_GO.md).

## 9. Tạo chủ cửa, chọn Wi-Fi, khởi động lại rồi đặt PIN

1. Trong app, **đăng ký tài khoản người dùng mới**, rồi đăng nhập tài khoản đó làm chủ cửa.
2. Chọn thêm/thiết lập cửa mới, quét QR **mới trên ESP32**. Nếu camera khó đọc, nhập `activationCode` từ factory file mới.
3. Vào Cài đặt Wi-Fi điện thoại, nối mạng `SmartDoor-…` của chip bằng mật khẩu trong QR/app. Giữ kết nối dù báo không có Internet. Expo Go dùng cách chuyển mạng trong Cài đặt.
4. Mở **`http://192.168.4.1`**, chọn Wi-Fi **2.4 GHz** thực tế cho ESP32; mạng này phải truy cập được MQTT host đã cấp ở bước 4. Nhập mật khẩu và hoàn tất. Nếu Tailscale/VPN cản portal, tạm ngắt trên điện thoại khi thiết lập AP.
5. **Chờ trang báo Đã lưu Wi-Fi. Sau đó nhấn/thả RST/EN hoặc rút nguồn ESP32 5 giây rồi cấp lại.** Chỉ khởi động lại thông thường, không giữ BOOT, không khôi phục mặc định và không ngắt điện khi đang lưu.
6. Đưa điện thoại về Wi-Fi/4G có Internet, bật lại Tailscale và trở lại app. Xác nhận đã khởi động lại, kiểm tra kết nối, chờ chip online. Bước này nằm trước đặt tên và lưu PIN đầu tiên.
7. Đặt tên cửa và xác nhận nhận cửa. Chờ nhận cửa thành công.
8. Tạo **PIN mở cửa 6 số** và **PIN quản trị 6 số khác PIN mở**. Chờ khóa xác nhận lưu; gửi yêu cầu thành công chưa có nghĩa khóa đã lưu xong.
9. Theo từng trang hướng dẫn: hiệu chỉnh cảm ứng trên TFT → xác nhận reed khi cửa đóng → xác nhận khi cửa mở. Với firmware 1.12.0, đăng ký mới hoàn tất tại đây, không bắt căn góc servo. Cấu hình góc đã lưu được giữ; thiết bị mới dùng mặc định khóa 100°/mở 30°. Chỉnh góc sau khi thiết lập tại **Cài đặt cửa → Góc Servo** nếu cần.
10. Chờ cửa báo **READY/sẵn sàng**, rồi bắt đầu thử mở cửa. Nếu bị gián đoạn, mở lại cửa trong app để tiếp tục bước chưa hoàn tất.

Nếu gặp lỗi lưu bộ nhớ khi đặt PIN, giữ nguyên danh tính đã cấp, khởi động lại bằng RST/EN rồi chờ online và thử lại. Không chạy script reset dữ liệu cho lỗi kết nối hoặc lỗi thao tác thông thường.

## 10. Thử bàn phím, RFID và vân tay

**Bàn phím ở trong nhà:** tại màn hình HOME sau khi thiết lập xong, nhập **PIN mở cửa** rồi bấm `#`. Bấm `*` để xóa. A/B/C/D không dùng nhập PIN. PIN quản trị không dùng để mở cửa bằng bàn phím. Bàn phím và PIN trên TFT dùng chung giới hạn nhập sai/chính sách quyền mở; kiểm tra không tắt phương thức PIN trong app.

Đấu dây đã chạy đúng, chân bàn phím đánh số theo đầu nối:

| Chân bàn phím | Chức năng | GPIO ESP32 |
|---|---|---|
| 1 | Cột A B C D | 38 |
| 2 | Cột 3 6 9 # | 15 |
| 3 | Cột 2 5 8 0 | 14 |
| 4 | Cột 1 4 7 * | 13 |
| 5 | Hàng * 0 # D | 12 |
| 6 | Hàng 7 8 9 C | 11 |
| 7 | Hàng 4 5 6 B | 8 |
| 8 | Hàng 1 2 3 A | 7 |

**Vân tay:** TX cảm biến → GPIO17; RX cảm biến → GPIO18; GND → GND; nguồn theo sơ đồ module đã kiểm tra trong dự án. TCH đã tháo, không nối GPIO16. Không đấu chung UART với bàn phím. Cảm biến hiện không có mẫu, cần đăng ký lại trên app và đặt/nhấc cùng ngón tay theo yêu cầu của cảm biến.

Thêm thẻ RFID mới bằng cách mở đăng ký thẻ trên app rồi quét thẻ. Dữ liệu thẻ cũ trên chip đã xóa; bản thân thẻ RFID vật lý không bị xóa nội dung bằng việc reset dự án. Thử mở với từng phương thức và đối chiếu lịch sử trong app. Chờ cửa đóng/khóa trở lại trước lượt thử kế tiếp.

## 11. Đăng ký khuôn mặt và ghép laptop AI

1. Tải ảnh/video khuôn mặt mới theo giao diện app. Dịch vụ face-api ở bước 7 phải còn chạy. Với thành viên khác, hoàn tất quyền/duyệt của chủ cửa theo giao diện.
2. Trên máy AI, bật Tailscale, nhấp đúp **`D:\DEV\IOT\Smart Door AI.cmd`**. Trang ghép mở ở `http://127.0.0.1:8092` của chính máy đó.
3. Dùng API `http://100.111.90.116:8080` nếu được hỏi. Đăng nhập **tài khoản chủ cửa**, chọn đúng cửa hoặc mã `SD-…` tại **Cài đặt cửa → Nhận diện bằng laptop**.
4. Cho phép camera, chọn camera và bật nhận diện theo giao diện. Danh tính camera cũ đã được dọn; thực hiện ghép mới, không chép secret thủ công từ bản sao cũ.
5. Thử người đã được cấp quyền và đối chiếu lịch sử. Đóng camera hoặc nhấn Q trong cửa sổ camera khi ngừng thử.

Chi tiết: [demo AI trên laptop](DEMO_AI_TREN_LAPTOP.md).

## 12. Kiểm tra hoàn tất và dừng dự án

Thử lần lượt: mở từ app → PIN bàn phím → thẻ mới → vân tay mới → khuôn mặt mới. Kiểm tra trạng thái đóng/mở thực tế, tự khóa và lịch sử. Sau đó có thể cho điện thoại dùng 4G + Tailscale để thử mở từ xa; ESP32 vẫn ở mạng Wi-Fi có gateway/broker của nó.

Muốn dừng các dịch vụ dự án, dùng một cửa sổ PowerShell khác:

```powershell
cd D:\DEV\IOT
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/stop-local.ps1
```

Lệnh dừng tiến trình dự án và đóng 1884/8080/8081/8091/8092; giữ MySQL, Tailscale và broker hệ thống riêng. Gateway ở máy khác cần Ctrl+C tại máy đó.

**Các lần chạy sau:** dùng [hướng dẫn khởi động hằng ngày](CHAY_DEMO_EXPO_GO_TU_DAU.md): bật broker, backend, face-api, mobile và camera khi cần. Giữ dữ liệu hiện có; không đăng ký MAC, nạp factory, xóa database hoặc nạp firmware lại mỗi lần chạy.
