# Kết quả kiểm thử và trạng thái bàn giao

Ngày 04/11/2026, workspace `D:\DEV\IOT`, ESP32-S3 MAC `80:B5:4E:C8:14:9C`, cổng COM5.

## Phần mềm đã kiểm tra

| Hạng mục | Kết quả |
|---|---|
| Backend Maven toàn bộ | 188 bài: 178 đạt, 10 bỏ qua, không failure/error; đóng gói JAR thành công |
| Luồng kích hoạt/reset/readiness bổ sung | Chạy lại `DeploymentFlowTest` đạt sau khi thêm hạ ACTIVE khi thiết bị không sẵn sàng và trạng thái cảm biến không rõ |
| Mobile TypeScript | Đạt `npm run typecheck` |
| Mobile lint | Không lỗi; còn 12 cảnh báo, chủ yếu React hooks và phần mã đã có |
| Mobile tests | 19/19 đạt, gồm phân quyền, Face API/math, lịch sử, thông báo, địa chỉ backend |
| Face node | 9/9 unit tests đạt; TLS MQTT đã thêm, chưa triển khai Internet |
| Logic firmware trên máy tính | Đạt: thời gian mở/khóa, interlock, rollover/restart, allowlist, hiệu chỉnh cảm ứng |
| Firmware kết nối | Build và upload COM5 thành công; kiểm tra hash flash qua esptool |
| Admin trong Edge headless | Đăng nhập, inventory, form thêm chip giữ dữ liệu qua poll, không page error |
| Mobile web trong Edge headless | Nhập backend, kiểm tra health, vào màn hình đăng nhập, không page error |
| Bundle Expo web | HTTP 200, bundle được biên dịch và phục vụ |
| API với MySQL/broker thật | Admin không đọc danh sách thành viên cửa của manager; user không vào admin; mã kích hoạt không dùng lại; lời mời cần người nhận chấp nhận; chưa cấp quyền thì không mở; hồ sơ FACE dùng chung nhưng cần chủ cửa duyệt; cấp camera thuộc chủ cửa; logout vô hiệu phiên |

Các bài unit dùng gateway giả không chứng minh servo hoặc cảm biến đã thực hiện vật lý. 10 bài bị bỏ qua không được tính là đạt.

## Phần cứng và mạng đã quan sát

- ESP32 đã kết nối Wi-Fi mở `PTIT_B2` và broker MQTT riêng cổng 1884 trên cùng LAN: `wifi=3`, `mqtt=1`.
- Đã nhận heartbeat, ACK `PIN_UPDATED` và ACK `UNLOCK_COMMAND` từ thiết bị thật. Đây là xác nhận điều khiển, không xác nhận chốt đã di chuyển.
- Người dùng báo servo không quay và cảm biến từ chưa nối. Trạng thái “đóng” hiệu chỉnh trước đó không được dùng làm bằng chứng vật lý.
- Đã sửa firmware: phải xác nhận cả đóng và mở với tín hiệu đổi trạng thái mới hoàn tất hiệu chỉnh; chưa xác minh thì heartbeat báo cửa không rõ, backend không cho trạng thái sẵn sàng. Không bật chế độ giả lập cảm biến.
- Vân tay hiện không phản hồi: firmware tích hợp và firmware bảo trì độc lập đều thất bại xác thực UART; đã thử 57600/9600/19200/38400/115200 baud. Người dùng đã cấp lại nguồn; vẫn không ACK. **Không xác minh được lần xóa cảm biến cuối.** Lần bảo trì trước trong phiên làm việc có biên bản từ 26 mẫu về 0, nhưng biên bản đó không thay thế xác minh trạng thái hiện tại.
- Không có broker/VPS Internet. Cấu hình MQTT TLS và hướng dẫn có sẵn, chưa kiểm thử ESP32 và backend ở hai LAN khác nhau.
- Chưa kiểm thử app native trên điện thoại và chưa kiểm thử nhận diện ảnh/người thật xuyên suốt tới cơ khí. Unit/API test FACE không thay thế thử camera thực tế.

## Dữ liệu bàn giao

- Database riêng `smart_access_dev_772989` đã xóa dữ liệu thử, giữ migration và tạo một admin với mật khẩu ngẫu nhiên mới. Thông tin riêng: `.local/ADMIN_ACCESS.txt`.
- Danh mục thiết bị trống, chưa có chủ cửa/thành viên/lời mời/credential FACE hoặc RFID/vân tay trong backend.
- ESP32 đã chạy `erase_flash` toàn bộ 16 MB rồi nạp lại firmware kết nối chưa cấp phát: chưa có device secret, Wi-Fi, PIN, quyền, hiệu chỉnh cảm ứng/cửa của lượt thử. Cần admin đăng ký MAC và cấp phát lại qua USB.
- Credential MQTT thử đã gỡ khỏi broker riêng; chỉ giữ account backend. Các file riêng chứa mã nhận cửa/secret thử đã dọn.
- Chưa được gọi trạng thái này là **toàn bộ hệ thống đã sạch** vì bộ nhớ riêng của cảm biến vân tay chưa có ACK đọc lại bằng 0.

## Hoàn thành kiểm thử vật lý sau khi sửa phần cứng

1. Kiểm tra nguồn/GND/TX/RX vân tay theo đúng module; không dựa vào màu dây. Tải firmware bảo trì và chạy công cụ bên dưới.
2. Chỉ khi `FINGERPRINT_COUNT_AFTER=0`, `CLEANUP_FINGERPRINT_EMPTY_VERIFIED` và reader reset thành công mới xác nhận cảm biến sạch.
3. Nạp lại firmware kết nối, đăng ký/cấp phát đúng chip bằng admin, kết nối Wi-Fi và hoàn tất cảm ứng/PIN.
4. Nối cảm biến từ và thử đóng → mở → đóng. Chỉnh góc, kiểm tra nguồn servo và cơ cấu không tải; quan sát servo nhả và khóa thực tế. Sau đó mới thử app, RFID, hai lần quét vân tay.
5. Đăng ký ảnh thật trên tài khoản người dùng, xin quyền, chủ cửa duyệt và thử camera người thật/ảnh giả; ngắt mạng phải không mở bằng FACE.
6. Triển khai broker TLS rồi thử hai LAN khác nhau. Cuối cùng reset thêm một lần và xác minh cảm biến, ESP32, backend cùng sạch.

```powershell
cd D:\DEV\IOT\firmware
& 'C:\Users\ACER\.platformio\penv\Scripts\pio.exe' run -c platformio.maintenance.ini -t upload
cd ..
& 'C:\Users\ACER\.platformio\penv\Scripts\python.exe' scripts/sensor_maintenance.py --port COM5 --scan
# Lệnh kế tiếp xóa toàn bộ mẫu vân tay; chỉ chạy khi muốn reset cảm biến:
& 'C:\Users\ACER\.platformio\penv\Scripts\python.exe' scripts/sensor_maintenance.py --port COM5 --erase --log .local/sensor-maintenance-result.log
cd firmware
& 'C:\Users\ACER\.platformio\penv\Scripts\pio.exe' run -c platformio.connected.ini -t upload
```

Hướng dẫn chi tiết cấp QR, cấu hình Wi-Fi, MQTT và thêm chip: [HUONG_DAN_TRIEN_KHAI.md](HUONG_DAN_TRIEN_KHAI.md).

## Cập nhật mobile sang Expo Go 58

Đã nâng mobile từ SDK 57 lên Expo 58.0.23, React Native 0.88.1, React/React DOM 19.3.0; đồng bộ các module Expo, WebView 14.0.1 và thêm expo-font theo Expo Doctor. Đã sửa kiểu generic WebView để kiểm tra TypeScript qua với API mới. Web giữ chế độ SPA (`web.output=single`).

Script `scripts/start-expo-go.ps1` ưu tiên Node 26.13.0 riêng trong `.local/node-runtime`, thay cho Node 25 toàn máy không được SDK 58 hỗ trợ. Dữ liệu backend, thông tin admin và firmware không thay đổi trong lần nâng này.

- Expo Doctor: **20/20 đạt**; kiểm tra dependency Expo: up to date.
- TypeScript: không lỗi. Mobile unit tests: **19/19 đạt**. Lint: không lỗi, còn 12 cảnh báo.
- Manifest Expo Go qua Tailscale: `sdkVersion=58.0.0`, host `100.111.90.116:8081`.
- Bundle Android tải HTTP 200; trang xử lý khuôn mặt native tải được qua cùng địa chỉ Tailscale.
- Điện thoại thực vẫn cần mở bằng Expo Go 58 để xác nhận camera, quyền thư viện ảnh và hành vi runtime; kiểm tra bundle không thay thế bước này.

URL mở app giữ nguyên `exp://100.111.90.116:8081`; backend nhập trong app là `http://100.111.90.116:8080`.

## Đọc MAC tích hợp web admin

Đã thêm liệt kê cổng USB máy backend và đọc MAC ESP32-S3 bằng esptool qua API admin; không chạy shell, không cho truyền lệnh tùy ý và không có thao tác xóa/nạp flash. Các cổng sai định dạng bị từ chối, thao tác đọc có thời hạn chờ và chỉ cho một thao tác USB mỗi lần. Giao diện tự điền MAC, giữ tên sản phẩm và dữ liệu form khi poll.

Kiểm thử backend: 192 bài, không failure/error, 10 bỏ qua. Unit helper Python: 2/2 đạt, từ chối MAC rỗng/toàn 0/toàn FF hoặc các dòng MAC mâu thuẫn. Kiểm thử COM5 qua giao diện được ghi trong `.local/admin-usb-mac.png` sau khi chạy thành công; ảnh chỉ là bằng chứng đọc định danh, không xác nhận vân tay hay cơ khí đã hoạt động.


## Luồng xuất xưởng/người mua — 05/11/2026 (thay thế trạng thái cũ ở trên)

Theo yêu cầu mới, đã xóa dữ liệu của cửa cũ và nạp lại COM5 thành sản phẩm chưa nhận. Các tài khoản được giữ. Lần này cảm biến vân tay xác thực, xóa và đọc lại thành công: số mẫu = 0; RC522 = 0x92, reset thành công. Do đó ghi chú cũ “chưa xác minh xóa vân tay” không còn áp dụng cho lần làm lại này.

- Backend: 194 bài, không failure/error, 10 bỏ qua. Thêm kiểm tra gói xuất xưởng và PIN đặt cục bộ.
- Mobile: 24/24 test đạt, TypeScript đạt, lint không lỗi; không còn màn hình nhập/đổi backend.
- Gói xuất xưởng chứa mã sản phẩm, mã nhận cửa, SSID/mật khẩu mạng thiết lập và khóa riêng; đã nạp vào NVS chip. QR trên TFT và tem QR không chứa khóa xác thực thiết bị. Không ghi Wi-Fi nhà trước khi giao.
- Firmware compile/upload thành công. Wi-Fi thiết lập SmartDoor-C8149C phát được, người dùng đã mở trang cấu hình trên điện thoại.
- Đã sửa thời gian chờ quét AP+STA và cache kết quả. Đo trực tiếp trên chip: tìm thấy 5 mạng duy nhất, có PTIT_B2. Người dùng đã xác nhận trang mới hiển thị PTIT_B2 để chọn.
- Kiểm thử trang cấu hình: quét bất đồng bộ, xử lý SSID an toàn, chọn Wi-Fi mở, đặt PIN, hoàn tất, không thuật ngữ backend/MQTT/Tailscale trong giao diện khách hàng. Kiểm thử giao diện dùng phản hồi mô phỏng; phần quét thực trên chip được xác nhận riêng như trên.
- Kiểm thử mobile web: vào thẳng đăng nhập; QR sản phẩm hiện SSID/mật khẩu đúng; form cuộn được; không tiêu thụ mã nhận cửa khi thử. Bundle Android SDK 58 được kiểm tra riêng; camera/quét QR thực trên điện thoại cần sử dụng để xác nhận.

Mã nhận cửa mới còn hiệu lực ở trạng thái INVENTORY lúc bàn giao, không nhận hộ vào tài khoản admin. Hướng dẫn chuẩn: LUONG_SAN_PHAM.md. Chưa có broker/VPS Internet nên triển khai khác LAN vẫn là phần hạ tầng cần hoàn thiện; không chuyển việc cấu hình dịch vụ cho người mua. Kiểm tra cơ khí và cảm biến từ vẫn cần hoàn tất khi nối phần cứng.
