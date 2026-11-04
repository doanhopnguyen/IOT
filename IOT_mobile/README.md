# Smart Door

Mobile hiện dùng **Expo SDK 58**, React Native 0.88.1 và React 19.3. Mở bằng Expo Go 58 trên Android. Cần Node 22.13+, 24.3+ hoặc 26+; script của workspace ưu tiên Node 26 riêng trong `.local/node-runtime`.

```powershell
powershell -ExecutionPolicy Bypass -File D:\DEV\IOT\scripts\start-expo-go.ps1
```

Bật Tailscale trên điện thoại, quét QR hoặc mở `exp://100.111.90.116:8081`. App dùng dịch vụ cấu hình sẵn, mở thẳng đăng nhập; người mua không nhập backend. Quét QR sản phẩm để xem mạng thiết lập và mở trang chọn Wi-Fi tại cửa. Xem [hướng dẫn triển khai](../docs/HUONG_DAN_TRIEN_KHAI.md) để chạy backend/broker và cấu hình thiết bị.

Ứng dụng di động Expo/React Native cho quản lý cửa thông minh. Toàn bộ giao diện mẫu dùng tiếng Việt và lớp dữ liệu demo được tách riêng, để có thể thay thế bằng backend thật.

## Chạy ứng dụng

```bash
npm install
npm start
npm run android
npm run ios
npm run typecheck
```

`npm run ios` cần macOS/Xcode. Android có thể chạy bằng Android Emulator hoặc Expo Go.

## Kiến trúc

- `app/`: Expo Router entry point và điều phối các màn hình.
- `src/theme/`: design tokens nhất quán (màu sắc, bán kính, khoảng cách).
- `src/components/`: thành phần dùng lại, gồm bottom navigation nổi, modal, card, input và button.
- `src/models/`: kiểu dữ liệu miền cho cửa, thành viên và lời mời.
- `src/utils/permissions.ts`: kiểm tra quyền theo từng cửa; không dùng cờ `isOwner` toàn cục.
- `src/services/mockSmartDoorService.ts`: repository demo bất đồng bộ. UI không truy cập trực tiếp mảng dữ liệu giả.

## Chức năng demo hiện có

- Splash, đăng nhập/đăng ký có kiểm tra cơ bản và khôi phục mật khẩu ở ranh giới backend.
- Thanh điều hướng dạng pill nổi gồm Trang chủ, Thiết bị, nút Thêm, Lời mời, Cá nhân.
- Danh sách cửa theo vai trò OWNER/USER; trạng thái khóa và trạng thái kết nối được tách biệt.
- Chi tiết cửa và mục quản lý chỉ dành cho OWNER.
- Mời/nhận lời mời, phản hồi lời mời; nhận lời mời cập nhật danh sách cửa demo.
- Quản lý thành viên, bật/tắt quyền riêng theo cửa và trạng thái đồng bộ.
- Lịch sử ra vào, đăng ký thiết bị nhiều bước, modal PIN mở cửa.

## Ranh giới tích hợp thực tế

`mockSmartDoorService` phải được thay bằng API đã được xác thực. PIN không được lưu hoặc ghi log; luồng demo chỉ chấp nhận `123456` trong bộ nhớ để minh họa phản hồi trạng thái và không tuyên bố đã mở cửa vật lý. Triển khai thực tế cần backend xác thực quyền, xác nhận lệnh từ thiết bị/ESP32, provisioning có chữ ký, secure storage, camera/SDK nhận diện khuôn mặt và đồng bộ trạng thái thiết bị.

Không thêm bí mật vào repository. Cấu hình URL/API key khi có backend nên dùng biến môi trường Expo công khai phù hợp (`EXPO_PUBLIC_*`) và không đưa credential đặc quyền vào client.
