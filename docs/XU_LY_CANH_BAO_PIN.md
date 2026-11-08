# Xử lý cảnh báo nhập sai PIN trên app

Áp dụng từ firmware **1.16.0 / 2.0.3-demo**, cùng backend và app mới.

Khi có cảnh báo **nhập sai PIN nhiều lần**, thông báo trên app và mục **Cảnh báo** có hai lựa chọn:

| Lựa chọn | Còi | Bàn phím và quyền mở cửa |
|---|---|---|
| **Cửa vẫn an toàn** | Tắt chuông của sự cố hiện tại | Xóa số lần PIN sai và khóa nhập PIN 30 giây, cho nhập PIN trở lại; không bật tạm khóa, không mở chốt |
| **Tạm thời khóa cửa** | Tắt chuông của sự cố hiện tại | Bật chế độ tạm khóa đang có: chặn PIN và quyền mở của thành viên; chủ cửa vẫn dùng quyền mở được cho phép |

**Tạm khóa là chế độ hạn chế quyền mở**, không phải lệnh ép servo đóng khi cánh cửa đang mở. Muốn gỡ, vào **Cài đặt thiết bị → Tạm khóa cửa → Mở khóa cửa**.

Thông báo thường (INFO/WARNING) hiện dưới dạng banner phía trên, tự ẩn sau 6 giây, cho phép tiếp tục thao tác bên dưới. Cảnh báo khẩn cấp (CRITICAL) và sai PIN cần xử lý vẫn dùng **popup giữa màn hình**, có nền mờ và ưu tiên trên màn hình/hộp thoại khác. Popup khẩn cấp không tự tắt; dùng **Xem chi tiết cảnh báo** để mở danh sách, hoặc **Đóng thông báo** để xem sau. Đóng popup không gửi lệnh tắt chuông. Hàng đợi thông báo thường tiếp tục sau khi xử lý/đóng khẩn cấp. Các thông báo chưa xem và cảnh báo PIN chưa xử lý được đọc khi mở lại app. Hai nút xử lý PIN cũng có trong danh sách cảnh báo. Xem [khả năng thông báo trong Expo Go](THONG_BAO_EXPO_GO.md).

App hiện **Đang chờ cửa xác nhận…**, khóa hai nút trong lúc gửi. Chỉ sau khi chip xác nhận đã áp dụng thì cảnh báo mới chuyển **Đã xử lý**. Mất mạng, hết hạn, firmware cũ hoặc lỗi bộ nhớ không được báo là thành công. Chủ cửa có thể thử lại sau khi khắc phục kết nối. Chọn Cửa vẫn an toàn không gỡ một chế độ tạm khóa đã bật trước đó; hãy gỡ tạm khóa ở cài đặt cửa.

Việc tắt chuông áp dụng cho sự cố đang phát chuông. Nếu đồng thời đang có cảnh báo cửa mở lâu, chuông của lần mở đó cũng được tắt đến khi cửa đóng. Một đợt sai PIN mới hoặc lần mở cửa kéo dài mới vẫn có thể báo chuông. Bộ đếm PIN được lưu về 0; chế độ tạm khóa được giữ sau reboot. Cấu hình servo khóa 0°, mở âm/dương, Wi-Fi, PIN, thẻ và vân tay được giữ nguyên khi nâng firmware.

## Kiểm tra ngày 08/11/2026

- Backend: **375 bài**, 365 đạt, 10 bài MySQL tùy chọn bỏ qua. Kiểm tra chủ cửa, CSRF, sai loại/trạng thái cảnh báo, cửa offline, gửi lặp, ACK đúng thiết bị/thông điệp, tạm khóa/gỡ khóa, không đóng cảnh báo khi lỗi; không tạo lại cảnh báo từ các lượt sai trước khi đã xử lý.
- Mobile: **89/89 bài đạt**; typecheck đạt; lint 0 lỗi, 12 cảnh báo có sẵn.
- **18 bộ firmware native đạt**. Motor, PIN, keypad và còi dùng logic production với phần cứng giả; kiểm tra hai lựa chọn, tắt/rearm chuông, lưu trạng thái, lệnh cũ, lỗi ghi/readback, khóa bàn phím trong tạm khóa, không báo chuông lại do cảm biến cửa rung/chập chờn sau khi đã tắt.
- Giao diện 360/390 px: thông báo tồn tại sau 6 giây, hai lựa chọn, vô hiệu hóa khi chờ ACK, lỗi giữ nguyên cảnh báo, thao tác trong danh sách. API giả lập; không phát lệnh xuống phần cứng thật từ lượt thử giao diện.
- Build bản chính **1.16.0**, demo **2.0.3-demo** và offline đạt. Binary/SHA-256: `.local/releases/firmware-manifest.json`.
- ESP32 `ESP32-80B54EC8149C` được nạp **2.0.3-demo** qua COM5 và kiểm tra hash. INFO cuối lượt kiểm tra: servo v4 khóa 0°, mở +180°, Wi-Fi/MQTT kết nối, hai vân tay, không lỗi motor/lưu trữ. Không cố tình nhập PIN sai hoặc bật tạm khóa trên cửa thật để thử.
- Backend mới chạy lại, health **READY**, API xử lý PIN đã hoạt động. Expo Go cần **Reload** để lấy giao diện mới.

Bằng chứng và bản sao NVS trước nạp: `.local/pin-alert-20261108/`.
## Popup dùng chung (08/11/2026)

App dùng một lớp Modal cho hộp thoại và popup khẩn cấp; khẩn cấp có ưu tiên cao nhất. Banner thường dùng lớp nổi cho phép thao tác bên dưới. Hộp thoại phía dưới giữ trạng thái nhưng không nhận thao tác khi popup cảnh báo đang hiện. Hai nút xử lý PIN tiếp tục chờ ACK từ thiết bị trước khi đóng cảnh báo.

Kiểm tra 93/93 bài app đạt, typecheck đạt, lint 0 lỗi/12 cảnh báo có sẵn; xuất bundle Android thành công. Trình duyệt đã kiểm tra popup trên thiết lập cửa mới, hộp thoại camera lồng nhau và xác nhận gỡ camera; giữ nguyên dữ liệu đang nhập, xếp hàng ba thông báo, không tự tắt, thao tác PIN và màn hình 360/390 px, tablet, xoay ngang. API thử được giả lập, không phát lệnh tới cửa thật. Ảnh và log: `.local/notification-popup-20261108/`.
