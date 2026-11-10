# Chạy demo từ đầu: Expo Go và laptop AI

> **Lưu ý (cập nhật 10/11/2026):** Luồng ESP32 qua gateway LAN trong tài liệu này là bản cũ. Từ bản bàn giao 09/11, ESP32 nối thẳng broker máy Cường qua Internet (TLS) và tải OTA qua HTTPS; xem team-tailscale/HOP.md (ghi ch? n?i b?, ch? gi? c?c b? t?i `team-tailscale/HOP.md`) và [DEMO_CAP_NHAT_FIRMWARE_TU_XA.md](DEMO_CAP_NHAT_FIRMWARE_TU_XA.md).

**Vừa xóa toàn bộ dữ liệu và nạp lại chip:** dùng [hướng dẫn sau reset với Tailscale](CHAY_LAI_SAU_RESET_TAILSCALE.md) để đăng ký và cấp phát trước.

Hướng dẫn cho máy hiện tại tại `D:\DEV\IOT`. Dependency, firmware và model đã được chuẩn bị. Khởi động lại dùng dữ liệu hiện có; không cần xóa database, đăng ký lại chip đã có hoặc build APK.

Địa chỉ đã kiểm tra ngày 07/11/2026: Tailscale máy chủ `100.111.90.116`, LAN Wi-Fi `10.18.0.194`. Nếu đổi mạng hoặc máy chủ, kiểm tra và cập nhật theo [hướng dẫn mạng](CHAY_TU_DAU_TAILSCALE.md).

## 1. Chuẩn bị

- Máy chủ bật MySQL và Tailscale. Điện thoại bật Tailscale cùng tailnet và có Expo Go tương thích SDK 58.
- Cấp nguồn cho ESP32. Chip kết nối Wi-Fi 2.4 GHz đã lưu, hoặc dùng QR/portal để chọn mạng ở bước 6.
- Dùng bốn cửa sổ PowerShell riêng cho bước 2–5; giữ chúng mở khi thử nghiệm. Một cửa sổ đang giữ dịch vụ và không trả lại dấu nhắc là bình thường.

## 2. Cửa sổ 1: MQTT dự án

```powershell
cd D:\DEV\IOT
powershell -ExecutionPolicy Bypass -File scripts/start-local.ps1 -Component broker
```

Broker dự án dùng cổng **1884**. Mosquitto dịch vụ hệ thống ở 1883 là tiến trình riêng. Broker có thể không in thêm log khi không có hoạt động; không chạy lệnh này nhiều lần trên cùng cổng.

## 3. Cửa sổ 2: backend

```powershell
cd D:\DEV\IOT
powershell -ExecutionPolicy Bypass -File scripts/start-local.ps1 -Component backend
```

Chờ backend khởi động, mở `http://100.111.90.116:8080/api/health` trên máy hoặc điện thoại. Phải có `"status":"READY"`. Script báo backend đã chạy nếu đã có bản Smart Door sẵn sàng tại cổng đó.

Trang quản trị: `http://100.111.90.116:8080/admin/index.html`. Thông tin admin hiện có nằm tại `.local/ADMIN_ACCESS.txt`; không dùng tài khoản admin hệ thống thay tài khoản chủ cửa khi ghép AI.

## 4. Cửa sổ 3: xử lý hồ sơ khuôn mặt

```powershell
cd D:\DEV\IOT
powershell -ExecutionPolicy Bypass -File scripts/start-local.ps1 -Component face-api
```

Đây là dịch vụ xử lý ảnh/video đăng ký trên cổng **8091**, chạy trên máy backend. Camera nhận diện mở cửa sẽ chạy ở bước 7.

## 5. Cửa sổ 4: Expo Go

```powershell
cd D:\DEV\IOT
powershell -ExecutionPolicy Bypass -File scripts/start-local.ps1 -Component mobile
```

Chờ QR Expo xuất hiện. Dùng Expo Go trên điện thoại quét QR terminal hoặc mở:

```text
exp://100.111.90.116:8081
```

QR terminal mở ứng dụng; QR trên ESP32 dùng nhận cửa trong ứng dụng. Điện thoại khác Wi-Fi máy chủ vẫn dùng được khi truy cập qua Tailscale. Nếu không vào được, thử `http://100.111.90.116:8081/status`; phải trả `packager-status:running`. Xem [xử lý lỗi Expo Go](CHAY_EXPO_GO.md).

## 6. Nhận cửa và thiết lập

Nếu cửa đã thuộc tài khoản và báo sẵn sàng, đăng nhập tài khoản đó rồi dùng tiếp. Nếu cửa chưa được nhận:

1. Đăng nhập/đăng ký tài khoản người dùng trên app.
2. Chọn **Thiết lập cửa mới** hoặc **Thêm thiết bị**, quét QR hiện tại trên ESP32. QR phải là mã chưa sử dụng của lượt cấp phát hiện tại.
3. Cửa đã online thì app chuyển sang hướng dẫn khởi động lại trước khi đặt tên. Nếu chưa online, bấm **Mở Wi-Fi để kết nối khóa**, chọn `SmartDoor-…`, dùng mật khẩu app đọc từ QR. Expo Go dùng bước kết nối trong Cài đặt Wi-Fi.
4. Giữ mạng của khóa dù không có Internet. Mở `http://192.168.4.1`, chọn Wi-Fi 2.4 GHz, bấm Hoàn tất và chờ báo Đã lưu. Nhấn/thả RST/EN hoặc rút nguồn khóa 5 giây rồi cấp lại; không khôi phục mặc định. Đưa điện thoại về Wi-Fi/4G có Internet, bật lại Tailscale nếu cần rồi trở lại app.
5. Xác nhận đã khởi động lại và kiểm tra kết nối; chờ cửa online rồi đặt tên và nhận cửa. App chuyển từng trang theo xác nhận của ESP32.
6. Tạo PIN mở và PIN admin, mỗi PIN 6 số và khác nhau. Hoàn tất cảm ứng → xác nhận cửa đóng → xác nhận cửa mở → căn servo LOCK → căn servo OPEN. Theo dõi chuyển động chốt khi căn.
7. Khi cửa sẵn sàng, thử mở/đóng từ app, PIN, thêm RFID bằng cách quét thẻ và thêm vân tay qua cảm biến.

Chip chưa được cấp phát cần [đăng ký/cấp phát trước](CHAY_TU_DAU_TAILSCALE.md#5-đăng-ký-và-cấp-phát-từng-esp32). Chip đang có danh tính không cần nạp factory lại khi khởi động. Sau reset, mã cũ đã dùng hết hiệu lực; admin cấp mã mới và chờ chip xác nhận cập nhật QR theo [hướng dẫn QR](QUET_QR_VA_THIET_LAP.md).

## 7. Ghép laptop và thử AI mở cửa

1. Nhấp đúp `D:\DEV\IOT\Smart Door AI.cmd`. Trình duyệt mở `http://127.0.0.1:8092`.
2. Đăng nhập **cùng tài khoản chủ cửa** trên app mobile.
3. Chọn cửa, hoặc nhập mã `SD-…` hiển thị ở **Cài đặt cửa → Nhận diện bằng laptop**.
4. Bấm **Kết nối cửa và bật AI**. Có thể ghép trước khi hoàn tất bước 6; camera chờ cửa online, hoàn tất thiết lập và bật quyền dùng khuôn mặt rồi tự chạy. Cho phép camera trên Windows nếu được hỏi.
5. Trên app, vào **Khuôn mặt của tôi**, đăng ký hồ sơ và yêu cầu/cấp quyền sử dụng tại cửa. Chủ cửa duyệt hồ sơ/quyền tương ứng.
6. Đứng trước webcam đủ sáng, nhìn rõ mặt. Kiểm tra kết quả nhận diện, lịch sử và ACK mở từ ESP32, đồng thời quan sát chốt thật. Thử thêm người chưa được cấp quyền để kiểm tra từ chối.

Không chạy thêm `node.py --camera` hoặc `-Component face` khi dùng launcher, để tránh hai tiến trình dùng cùng webcam. Chọn **Tự chạy lại** để dùng thông tin ghép đã lưu ở lần mở launcher sau. Nhấn **Dừng nhận diện** hoặc Q để dừng camera.

Laptop AI khác máy chủ: bật Tailscale, trong trang laptop nhập máy chủ `http://100.111.90.116:8080`. Chi tiết: [demo laptop AI](DEMO_AI_TREN_LAPTOP.md).

## 8. ESP32 ở mạng khác

Tailscale trên điện thoại/laptop không tự đưa ESP32 vào tailnet. Tại mỗi mạng đặt chip, chạy gateway trên một máy cùng LAN với chip và có Tailscale:

```powershell
cd D:\DEV\IOT
.local\venv\Scripts\python.exe scripts/mqtt_gateway.py --listen <IP-LAN-cua-gateway> --server 100.111.90.116
```

Thay toàn bộ `<IP-LAN-cua-gateway>` bằng IP thực của máy tại điểm đó. ESP32 dùng IP LAN gateway làm MQTT host và cổng 1884, với thông tin riêng đã cấp phát. Nếu chip ở cùng LAN máy chủ, dùng MQTT host `10.18.0.194`, cổng 1884, không cần gateway riêng. Xem [hướng dẫn gateway](CHAY_TU_DAU_TAILSCALE.md#6-gateway-tại-mỗi-điểm-đặt-esp32).

## 9. Dừng sau khi thử

Khóa từ xa, hẹn giờ và đồng bộ góc sau khi cửa đã thiết lập: xem [hướng dẫn firmware 1.8.0](KHOA_TU_XA_VA_TU_DONG.md).

```powershell
cd D:\DEV\IOT
powershell -ExecutionPolicy Bypass -File scripts/stop-local.ps1
```

Dừng trên mỗi máy có chạy dịch vụ/gateway. Các cổng dự án 1884, 8080, 8081, 8091, 8092 được giải phóng; dữ liệu được giữ. MySQL, Tailscale và Mosquitto hệ thống 1883 tiếp tục chạy. Lần sau bắt đầu lại từ bước 2.
