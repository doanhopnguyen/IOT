# Quét QR và thiết lập cửa từng bước

## QR sản phẩm

QR mới chứa cùng lúc tên mạng, mật khẩu Wi-Fi riêng của khóa và mã nhận cửa. Dạng `WIFI:…` cho phép camera hệ thống trên thiết bị hỗ trợ đề nghị tham gia mạng; ứng dụng Smart Door đọc thêm mã nhận cửa và tên khóa. QR không chứa địa chỉ API hoặc khóa bí mật của thiết bị.

Tên hiển thị là tên thiết bị gọn hoặc `Smart Door C8149C`. Mục **Mã nhận cửa** chỉ hiện mã nhận cửa, không hiện nguyên URL QR. Các QR `smartdoor://activate?...` đã cấp trước đây còn hiệu lực và mã nhập tay vẫn dùng được; không phải đăng ký lại sản phẩm chỉ để đổi định dạng QR.

Android dùng dữ liệu QR gốc (`raw`) để giữ mã nhận cửa trong QR Wi-Fi. Nếu đang mở bản app cũ báo mã không hợp lệ ngay sau quét, reload dự án trong Expo Go. Cửa đã nhận thành công thì mã dùng một lần hết hiệu lực; mở cửa đã thêm để tiếp tục thiết lập. Xem kiểm tra QR và tải ảnh (ghi ch? n?i b?, ch? gi? c?c b? t?i `KIEM_THU_QR_FACE_2026-11-07.md`).

QR sản phẩm mới trên web admin và trên màn hình ESP32 dùng định dạng Wi-Fi. Firmware hiện tại **1.12.0**. Khi cửa đã được nhận, QR trên màn hình đổi Wi-Fi chỉ chứa thông tin tham gia mạng, không cấp lại mã nhận cửa.

### Đưa chip chưa nhận về bước chọn Wi-Fi

Nếu chip đang chờ nhận cửa, chưa có PIN/cấu hình người dùng, có thể xóa riêng Wi-Fi đã lưu qua USB mà giữ nguyên QR sản phẩm và danh tính thiết bị:

```powershell
cd D:\DEV\IOT
.local\venv\Scripts\python.exe scripts/device_tool.py --port COM5 forget-wifi --confirm-uid ESP32-80B54EC8149C
.local\venv\Scripts\python.exe scripts/device_tool.py --port COM5 info
```

Thay COM và UID đúng chip. Firmware 1.7.2 trở lên mới hỗ trợ lệnh. Phải nhận `WIFI_RESET_COMPLETE`, sau reboot INFO có `savedWifi=0`, `claimed=0`, `configBytes=0`, `appPins=0` và `productPrepared=1`. Chip phát AP thiết lập và hiển thị QR nhận cửa; chưa online với backend cho đến khi người dùng chọn Wi-Fi lại. Mật khẩu AP riêng của sản phẩm được giữ để QR tiếp tục dùng được.

Lệnh từ chối chip đã nhận, đang reset hoặc có cấu hình PIN/thẻ/vân tay/cảm ứng/servo. Với cửa đã có dữ liệu người dùng, dùng reset có xác thực trong app/admin và chờ xác nhận xóa cảm biến; lệnh này không thay thế reset cửa.

### Cấp mã lại sau reset

Mã nhận cửa cũ đã dùng sẽ hết hiệu lực. Trên web admin, cấp mã mới sau khi reset hoàn tất; backend gửi lệnh cập nhật mã xuống khóa qua MQTT. Chờ thông báo **Khóa đã xác nhận lưu QR mới**, rồi quét QR mới **trên màn hình khóa** để lấy cả mã nhận cửa và Wi-Fi. Bản QR in riêng từ màn hình cấp lại có thể chỉ chứa mã mới; dùng QR trên khóa để có đủ thông tin Wi-Fi.

Nếu khóa offline, dùng Wi-Fi đang hiển thị trên khóa hoặc camera hệ thống quét QR Wi-Fi để chọn lại mạng. Khi khóa online, bấm **Gửi lại QR mới xuống khóa** trong trang cấp mã. Cần nhập lại mật khẩu tài khoản để gửi lại. Mã đã bị cấp thay thế sẽ bị từ chối; lệnh đến muộn không ghi đè mã mới hơn. Thông tin nhận dạng thiết bị, mạng đã lưu và cấu hình cửa được giữ nguyên khi đồng bộ mã.

## Kết nối điện thoại

Để demo, dùng **Expo Go** theo [hướng dẫn chạy](CHAY_EXPO_GO.md); không cần build hoặc cài APK. Các bước nhận cửa, thiết lập và ghép laptop AI đều có trong Expo Go.

- **Bản app Android cài riêng:** sau khi quét và kiểm tra sản phẩm, điện thoại mở hộp thoại xác nhận Wi-Fi có sẵn tên/mật khẩu. Chấp nhận kết nối, giữ mạng dù không có Internet; mở trang chọn Wi-Fi 2.4 GHz cho khóa. Máy dùng Android 11 trở lên hỗ trợ thao tác này.
- **Expo Go/web hoặc máy chưa hỗ trợ:** dùng camera hệ thống quét cùng QR trên khóa/tem để lấy Wi-Fi, hoặc mở Cài đặt Wi-Fi và dùng tên/mật khẩu đã đọc từ QR. Không cần tự đọc nguyên URL hay tìm địa chỉ API.
- **iOS:** phần kết nối được tích hợp qua Hotspot Configuration trong bản app cài riêng; vẫn phải xác nhận trên điện thoại. Chưa kiểm tra bản iOS bằng Xcode trên máy Windows này.

Kết nối Wi-Fi tự động dùng API hệ thống, cần bản app được build có module Smart Door Wi-Fi; cập nhật JavaScript qua Expo Go không thể thêm module native. Android dùng [hộp thoại thêm mạng của hệ thống](https://developer.android.com/develop/connectivity/wifi/wifi-save-network-passpoint-config). QR Wi-Fi dùng [định dạng được ZXing hỗ trợ](https://github.com/zxing/zxing/blob/master/core/src/main/java/com/google/zxing/client/result/WifiResultParser.java), kèm các trường sản phẩm riêng.

## Các trang tự chuyển tiếp

1. **Quét QR sản phẩm.** Quét đúng thì chuyển sang Wi-Fi. Có thể nhập mã nhận cửa nếu camera không đọc được.
2. **Kết nối Wi-Fi cho cửa.** Điện thoại tham gia mạng của khóa; trên trang của khóa chọn Wi-Fi 2.4 GHz thực tế và bấm Hoàn tất. Đưa điện thoại về mạng có Internet/Tailscale. App kiểm tra định kỳ và tự chuyển khi cửa online.
3. **Khởi động lại cửa.** Chờ portal báo Đã lưu Wi-Fi, nhấn/thả RST/EN hoặc ngắt nguồn 5 giây rồi cấp lại. App kiểm tra cửa đã kết nối lại trước khi cho tiếp tục.
4. **Đặt tên cửa.** Đặt tên, bấm Nhận cửa và tiếp tục. Chỉ sau phản hồi nhận cửa thành công mới chuyển sang PIN.
5. **Tạo hai mã PIN** trên app. Chờ ESP32 xác nhận lưu; không chuyển bước chỉ vì yêu cầu đã gửi.
6. **Hiệu chỉnh cảm ứng.** Làm theo các dấu cộng trên màn hình khóa; app hiển thị từng điểm và tự chuyển khi hoàn tất.
7. **Xác nhận cửa đóng.** Đóng cửa/đặt nam châm, xác nhận trên màn hình khóa.
8. **Xác nhận cửa mở.** Mở cửa/đưa nam châm ra xa, xác nhận trạng thái khác. Firmware 1.12.0 lưu cấu hình servo đã có hoặc mặc định và báo sẵn sàng; không bắt căn góc trong đăng ký mới.

Mỗi thời điểm chỉ có nội dung của bước hiện tại. Khi đóng và mở lại trang cài đặt, app đọc trạng thái cửa để tiếp tục đúng bước. Mất mạng không làm app coi bước chưa được xác nhận là đã xong. Sau thiết lập, các phần chỉnh servo, đổi PIN và đổi Wi-Fi mở thành từng trang riêng.

Góc servo là mục tùy chọn riêng tại **Cài đặt cửa → Góc Servo**; vẫn có quay thử, chỉnh và lưu theo ACK như trước. Cấu hình có sẵn không bị đổi khi nâng firmware. Thiết bị mới dùng góc mặc định khóa 100°/mở 30°, hành trình 180°; việc chấp nhận cấu hình này không tự phát lệnh quay.

Ghép laptop theo [hướng dẫn demo AI](DEMO_AI_TREN_LAPTOP.md). Khi laptop đã được ghép và bật chờ, hoàn tất bước 8 và khóa báo sẵn sàng sẽ làm camera tự bắt đầu; không cần chép secret hay chạy worker thủ công.

## Build lại app Android

Bản APK Android ARM64 đã build để chép sang điện thoại: `.local/releases/SmartDoor-demo-QR-AI.apk` (khoảng 40 MB). Dùng bản cài riêng này để có hộp thoại kết nối Wi-Fi một chạm; Expo Go tiếp tục dùng được các trang thiết lập và cách kết nối qua Cài đặt.

```powershell
cd D:\DEV\IOT\IOT_mobile
npm run typecheck
npm test
npm run lint
npx expo prebuild --platform android --no-install
cd android
.\gradlew.bat :app:assembleRelease -PreactNativeArchitectures=arm64-v8a
```

Cần Node/Java/Android SDK đã cấu hình. Native Android/iOS được sinh bằng Expo, không chỉnh tay các thư mục sinh ra. File APK nằm tại `IOT_mobile/android/app/build/outputs/apk/release/app-release.apk`; đây là bản phục vụ demo với cấu hình ký phát triển, chưa phải bản phát hành lên cửa hàng.
