# Chạy lại dự án trên máy hiện tại

Firmware connected 1.2.0 dùng [luồng thiết lập bằng app](THIET_LAP_APP_VA_WIFI.md): Wi-Fi trước, app kiểm tra online rồi nhận cửa/đặt PIN; chip chỉ dẫn hiệu chỉnh. Không tạo PIN trên portal hoặc chip. Các ghi chú reset/firmware cũ bên dưới là lịch sử trước thay đổi này.

Các lệnh dưới đây dùng những dependency, DB, file cấu hình và bản backend đã build sẵn trong D:\DEV\IOT. Không chạy lại script khởi tạo/xóa DB để khởi động hằng ngày.

## Chuẩn bị

- MySQL đang chạy trên cổng 3306. Giữ dịch vụ này hoạt động.
- Bật Tailscale trên máy tính và điện thoại, dùng cùng mạng Tailscale; địa chỉ máy tính đang cấu hình là 100.111.90.116.
- Bản demo ESP32 dùng broker trong LAN của máy tính. Cửa và máy tính cần cùng LAN có thể truy cập nhau; Tailscale của điện thoại không tự đưa ESP32 vào mạng Tailscale.
- Cấp nguồn cửa. Không cần nạp lại firmware khi khởi động các dịch vụ.

## Chạy ba cửa sổ PowerShell

Mỗi khối chạy trong một cửa sổ riêng, giữ các cửa sổ mở.

1. Broker MQTT (cổng 1884):

```powershell
cd D:\DEV\IOT
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-local.ps1 -Component broker
```

2. Backend và web admin (cổng 8080):

```powershell
cd D:\DEV\IOT
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-local.ps1 -Component backend
```

Chờ backend khởi động xong. Mở http://localhost:8080/admin/index.html tại máy tính. Máy khác trong Tailscale mở http://100.111.90.116:8080/admin/index.html. Admin dùng thông tin trong .local/ADMIN_ACCESS.txt; mật khẩu không đổi sau khi xóa người dùng.

3. Expo Go (cổng 8081):

```powershell
cd D:\DEV\IOT
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-local.ps1 -Component mobile
```

Mở Expo Go Android tương thích SDK 58 rồi quét QR ở terminal để tải app. Nếu nhập URL thủ công, dùng exp://100.111.90.116:8081. Script tự chọn Node tương thích đã cài trong dự án.

QR của Expo dùng để mở ứng dụng, khác QR sản phẩm dùng để nhận cửa. Ứng dụng có sẵn địa chỉ dịch vụ, không có bước nhập backend cho người mua.

## Thử từ đầu bằng tài khoản mới

1. Mở lại/reload app; đăng ký tài khoản người dùng mới.
2. Chọn thêm thiết bị và quét QR mới trong .local/PRODUCT_QR_ESP32-80B54EC8149C.png hoặc trên màn hình cửa. Mã nhận cũ đã bị thay thế.
3. Kết nối Wi-Fi SmartDoor-C8149C theo mật khẩu trên màn hình cửa, giữ kết nối nếu điện thoại báo không có Internet.
4. Điện thoại thường tự mở captive portal. Nếu chưa, mở http://192.168.4.1; chọn WIFI, NHẬP MẬT KHẨU. Đây là trang trên ESP32, khác trang admin.
5. Hoàn tất Wi-Fi, đưa điện thoại về mạng có Internet và trở lại app để nhận cửa.

Trạng thái hiện tại: giữ firmware gốc, nên bước PIN còn theo giao diện bản đang chạy; thiết kế chuyển toàn bộ bước này về app chưa triển khai. Bộ nhớ vân tay chưa xác minh xóa trong lượt reset gần nhất vì cảm biến không phản hồi. Xem .local/BUYER_RESET_STATUS.md.

## Dừng dịch vụ

Nhấn Ctrl+C trong từng cửa sổ rồi chờ tiến trình thoát. Các cổng dự án là 1884, 8080, 8081. Không cần dừng MySQL hoặc Tailscale.

## Kiểm tra khi gặp lỗi

- Cổng bị chiếm: kiểm tra bằng lệnh dưới, xác định đúng tiến trình trước khi dừng.

```powershell
netstat -ano -p tcp | Select-String ':(1884|8080|8081)\s+.*LISTENING'
```

- Backend chưa chạy: thử mở http://localhost:8080/api/health.
- App không tải: kiểm tra Tailscale cả hai máy/điện thoại và cổng 8081; dùng QR ở terminal vừa khởi động.
- Cửa đã có Wi-Fi nhưng offline: kiểm tra máy tính và ESP32 có cùng LAN, broker 1884 đang chạy và Windows Firewall cho phép kết nối theo cấu hình demo. Chưa có broker Internet nên chưa thử khác LAN bất kỳ.

Face node là thành phần tùy chọn, cần cấu hình/cấp phát camera node theo hướng dẫn triển khai trước khi dùng. Không cần chạy để thử đăng ký tài khoản và nhận cửa. Sau khi đã cấu hình, khởi động bằng start-local.ps1 -Component face trong một cửa sổ riêng; cửa sổ camera hiện mặt và kết quả nhận diện, nhấn Q để dừng.
