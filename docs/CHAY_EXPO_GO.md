# Chạy Smart Door bằng Expo Go

Chạy toàn bộ hệ thống từ lúc các tiến trình đã dừng: xem [thứ tự mở MQTT, backend, khuôn mặt, Expo và AI](CHAY_DEMO_EXPO_GO_TU_DAU.md).

Mobile dùng Expo Go tương thích **Expo SDK 58**. Không cần build Android hay cài APK Smart Door. Laptop nhận diện khuôn mặt vẫn chạy bằng `Smart Door AI.cmd` vì camera và model AI nằm trên laptop.

## Mở app trên máy hiện tại

1. Bật Tailscale trên máy chủ và điện thoại, dùng cùng tailnet.
2. Backend và broker cần đang chạy theo [hướng dẫn hệ thống](CHAY_TU_DAU_TAILSCALE.md). Để đăng ký khuôn mặt, chạy thêm dịch vụ `face-api`.
3. Trong PowerShell:

   ```powershell
   cd D:\DEV\IOT
   powershell -ExecutionPolicy Bypass -File scripts/start-local.ps1 -Component mobile
   ```

4. Giữ cửa sổ này mở. Dùng Expo Go quét QR **Expo trong terminal**, hoặc mở địa chỉ `exp://100.111.90.116:8081` trên điện thoại. Nếu terminal mobile đã chạy, dùng lại địa chỉ đó thay vì mở thêm Metro trên cùng cổng.
5. Đăng nhập hoặc đăng ký tài khoản, rồi dùng chức năng **Thiết lập cửa mới** trong app để quét QR **trên ESP32**. Hai QR có mục đích khác nhau: QR terminal mở ứng dụng; QR sản phẩm nhận cửa.

Script chọn Node phù hợp dự án và địa chỉ Tailscale được lưu trong cấu hình, luôn chạy Expo Go bằng `--go`. Nếu IP máy chủ thay đổi, cập nhật cấu hình theo hướng dẫn hệ thống. Điện thoại có thể dùng mạng Wi-Fi/4G khác, miễn truy cập được máy chủ qua Tailscale.

Nếu dùng trực tiếp thư mục mobile, `npm start`, `npm run android`, `npm run ios` cũng chọn Expo Go. Trên Windows, `npm run ios` không mở được iOS Simulator; iPhone thật vẫn có thể quét QR Expo. Với Tailscale, ưu tiên script ở trên để chọn đúng địa chỉ máy chủ.

## Kết nối Wi-Fi cho cửa trong Expo Go

Expo Go không chứa module riêng để thêm mạng Wi-Fi của Smart Door bằng hộp thoại native. App vẫn đọc được SSID/mật khẩu từ QR và hỗ trợ toàn bộ luồng thiết lập:

1. Nếu cửa đã online, app chuyển sang hướng dẫn khởi động lại trước khi đặt tên và nhận cửa; không cần nối lại AP nếu Wi-Fi đã được lưu.
2. Nếu cửa chưa online, bấm **Mở Wi-Fi để kết nối khóa**, chọn mạng `SmartDoor-…` và nhập mật khẩu đang hiển thị trong app. Hoặc dùng camera hệ thống quét QR Wi-Fi trên khóa.
3. Giữ kết nối với khóa dù điện thoại báo mạng không có Internet. Mở `http://192.168.4.1` để chọn Wi-Fi 2.4 GHz cho ESP32.
4. Bấm Hoàn tất, chờ báo Đã lưu Wi-Fi, nhấn/thả RST/EN hoặc rút nguồn khóa 5 giây rồi cấp lại. Đưa điện thoại về Wi-Fi/4G có Internet và bật lại Tailscale nếu cần, rồi trở lại Expo Go. Xác nhận đã khởi động lại; app kiểm tra kết nối trước khi cho nhận cửa/đặt PIN. Không giữ BOOT hay khôi phục mặc định.

Không thể cập nhật JavaScript để bổ sung module native vào Expo Go; giới hạn này được giải thích trong [tài liệu Expo](https://docs.expo.dev/develop/development-builds/introduction/). Khi dùng Expo Go, không cần chạy các lệnh `expo prebuild` hay `expo run:android`.

## Ghép laptop AI

Mở `Smart Door AI.cmd`, đăng nhập cùng tài khoản chủ cửa, chọn cửa hoặc nhập mã `SD-…` trong **Cài đặt cửa → Nhận diện bằng laptop**, rồi bấm **Kết nối cửa và bật AI**. Camera chờ cửa hoàn tất thiết lập rồi tự chạy. Đăng ký và cấp quyền khuôn mặt trên app trước khi thử mở chốt. Chi tiết: [demo AI trên laptop](DEMO_AI_TREN_LAPTOP.md).

## Khi không mở được app

- Không truy cập được backend: thử `http://100.111.90.116:8080/api/health` từ trình duyệt điện thoại; cần trả `READY`. Kiểm tra Tailscale và quyền truy cập mạng nếu không kết nối được.
- Expo báo không kết nối được: thử `http://100.111.90.116:8081/status`; cần trả `packager-status:running`. Máy chủ cần cho phép TCP 8081 qua Firewall/Tailscale.
- Expo báo SDK không tương thích: dùng Expo Go hỗ trợ SDK 58; không hạ dependency dự án để bỏ qua thông báo.
- Vừa chuyển khỏi Wi-Fi của khóa: đợi mạng Internet/Tailscale kết nối lại rồi quay về Expo Go. Nếu cần, mở lại địa chỉ Expo ở trên.
