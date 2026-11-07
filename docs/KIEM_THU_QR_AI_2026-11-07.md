# Kiểm tra QR, thiết lập từng bước và laptop AI · 07/11/2026

- Backend `mvn package`: **288 bài**, 278 đạt, 10 bài MySQL tùy chọn bỏ qua; không lỗi. Bao gồm phân quyền camera, chờ cửa sẵn sàng, đường nhận diện dùng API và đồng bộ mã kích hoạt sau reset.
- Mobile: **56/56** bài đạt, typecheck đạt. Lint không lỗi, 12 cảnh báo có sẵn. Bundle Android Metro biên dịch thành công.
- Laptop AI: **22/22** bài Python đạt. Kiểm tra chờ thiết lập, đúng tài khoản/mã cửa, đổi tài khoản, thu hồi khóa, mất mạng, dừng, khởi động lại, bảo vệ portal localhost và giữ bí mật khỏi giao diện. Kiểm tra checksum model nhận diện và xác minh người thật thành công.
- Firmware: 7 bộ host test đạt (offline, setup, factory reset, servo preview, product QR, xóa thành viên, đồng bộ mã kích hoạt). Build connected và upload **1.7.1** thành công, flash được kiểm tra hash.
- Android ARM64: module Wi-Fi và APK release build đạt; chữ ký APK hợp lệ. APK có module native Smart Door Wi-Fi và bundle ứng dụng. Bản iOS chưa build/kiểm tra trên Windows.

## Kiểm tra trên hệ thống đang chạy

Backend health báo `READY`. Đăng nhập laptop qua portal localhost và lấy danh sách cửa đúng quyền thành công; đăng xuất xóa phiên và không mở camera. Trang quản trị đang phục vụ QR định dạng mới.

Phát hiện file cấp phát cũ còn mã lượt đầu (generation 1), trong khi thiết bị và inventory đã ở generation 2 sau reset. Mã cũ trả 404 khi kiểm tra. Đã cấp mã mới cho đúng thiết bị đang ở `INVENTORY` và đồng bộ qua MQTT:

- Thiết bị: `ESP32-80B54EC8149C`.
- Kết quả: `ACKNOWLEDGED / ACTIVATION_QR_SAVED`.
- Backend kiểm tra mã mới trả HTTP 200, cùng UID, cửa online.
- Generation giữ **2**. Cập nhật file cấp phát riêng trong `.local` theo mã mới; thông tin nhận dạng, Wi-Fi và dữ liệu người dùng được giữ.

Chưa thực hiện nhận diện người thật và mở chốt trên phần cứng cho lần kiểm tra này: cửa đang `CLAIM`, chưa có PIN/hiệu chỉnh/khuôn mặt được cấp quyền. Người dùng hoàn tất [wizard](QUET_QR_VA_THIET_LAP.md) và [hướng dẫn demo](DEMO_AI_TREN_LAPTOP.md) để kiểm tra chuyển động và nhận diện thực tế.

## File sử dụng

- Mở laptop: `Smart Door AI.cmd` hoặc `scripts/start-edge-ai.ps1`.
- Portal laptop: `http://127.0.0.1:8092`.
- APK demo: `.local/releases/SmartDoor-demo-QR-AI.apk`, 41.257.512 bytes.
- SHA-256 APK: `EABC79C8A9E75EE63F0C90E83FF70325D8E634CE95B0C649D3905121A33DF214`.

Log kiểm tra: `.local/qr-ai-backend-full.log`, `.local/qr-mobile-tests.log`, `.local/qr-typecheck.log`, `.local/qr-lint.log`, `.local/edge-ai-tests.log`, `.local/qr-ai-app-final.log`, `.local/qr-firmware-upload.log`. Kết quả đồng bộ QR không chứa mã bí mật nằm tại `.local/qr-ai-20261107/qr-sync-result.json`; log backend hiện tại ở cùng thư mục, tên `backend-sync.out.log`.
