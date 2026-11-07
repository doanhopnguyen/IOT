# Kiểm thử

Mã test nằm cạnh từng thành phần; thư mục này là mục lục và cách chạy toàn bộ. CI (`.github/workflows/ci.yml`) chạy cùng các lệnh này.

| Thành phần | Vị trí | Lệnh | Nội dung chính |
|---|---|---|---|
| Backend (unit + tích hợp H2 + MockMvc) | `smart-access-control-backend/src/test` | `cd smart-access-control-backend && mvn test` | Phân quyền chủ cửa/thành viên/admin, lệnh thiết bị + ACK, vân tay, telemetry, quy tắc cảnh báo, thống kê/CSV, cài đặt cửa, kích hoạt/reset |
| Tích hợp MySQL thật | cùng thư mục, đang `@Disabled`/skip khi không có MySQL | như trên với DB thật | 10 bài bỏ qua trong CI |
| Mobile | `IOT_mobile/tests` | `cd IOT_mobile && npm run typecheck && npm test` | API client, phân quyền theo cửa, lịch sử, biểu đồ, cài đặt, cảnh báo |
| Face node | `face-node/tests` | `cd face-node && python -m unittest discover -s tests -p "test_*.py"` | Ngưỡng nhận diện, cache mẫu, cổng quyết định |
| Script | `scripts/tests` | `python -m unittest discover -s scripts/tests -p "test_*.py"` | Đo độ trễ, đọc MAC USB, gateway TCP, chặn reset sai DB/schema hoặc khi dịch vụ còn chạy; cài `scripts/requirements-local.txt` trước |
| Firmware | `firmware` | `pio run -c platformio.connected.ini` | Biên dịch; kiểm thử chức năng thực hiện trên thiết bị thật |

Sau build firmware, chạy `python firmware/tests/test_member_removal.py` để kiểm tra hàm xóa thành viên thật với ArduinoJson, lỗi cảm biến/NVS, gửi lại và chống xóa nhầm slot tái sử dụng.

`python firmware/tests/test_physical_keypad.py` chạy các hàm nhập HX-543 và xác thực PIN thật với phần cứng mô phỏng: cùng PIN/giới hạn sai/lịch sử như TFT, không ghép lượt nhập hai nguồn, hết hạn 15 giây, phím giữ/bấm đồng thời, chặn setup/reset/tạm khóa/tạm ngưng/thu hồi và lưu cờ bật/tắt PIN qua NVS. Test không phát lệnh lên cửa thật; quy trình thử cơ khí ở [hướng dẫn HX-543](../docs/BAN_PHIM_TRONG_NHA.md).

`python firmware/tests/test_wifi_storage.py` chạy các hàm lưu/đọc mạng Wi-Fi thật với NVS giả: mạng mở không bị báo nhầm lỗi khi mật khẩu rỗng, giữ đúng mạng qua reboot, xóa mật khẩu cũ khi chuyển sang mạng mở, và không xác nhận lưu khi ghi/xóa/đọc lại thất bại.

Chạy `python firmware/tests/test_servo_preview.py` để kiểm tra motor task thật: bước 1°, hành trình 180/360, xung PWM, gộp lệnh nhích, dừng/hết phiên và chặn khóa khi cánh cửa mở. `test_offline_door.py` còn kiểm tra nâng cấu hình NVS v1/v2 lên v3, giữ PIN/thẻ/vân tay và góc nguyên trên 255°.

`test_product_qr.py` kiểm tra QR Wi-Fi kèm mã nhận cửa. Sau build, `test_activation_qr_sync.py` kiểm tra cập nhật mã sau reset theo thứ tự/generation, đọc lại NVS và giữ nguyên thông tin nhận dạng/Wi-Fi. Các bài laptop AI nằm trong `face-node/tests/test_desktop_setup.py`; không mở camera hoặc gửi lệnh mở cửa khi chạy test.

## Kiểm thử phi chức năng và bảo mật (trên thiết bị thật)

- Độ trễ lệnh: mở cửa từ xa ~30 lần rồi `python scripts/measure_nfr.py --since <giờ bắt đầu>` → bảng p50/p95/max.
- Bảo mật broker: `python scripts/broker_security_check.py --host <IP> --port 1884 --uid <UID thiết bị>` → không cho kết nối ẩn danh/sai mật khẩu, thiết bị không đọc/ghi topic của thiết bị khác.
- Kết quả và nhận xét ghi vào `docs/KET_QUA_KIEM_THU.md`.

## Kiểm tra xóa Wi-Fi trên chip chưa nhận

`python firmware/tests/test_unclaimed_wifi_reset.py` chạy hàm firmware thực với trạng thái sở hữu, cấu hình người dùng và lỗi xóa/đọc lại bộ nhớ. Kiểm tra từ chối chip đã nhận hoặc đã cấu hình, không báo thành công khi xóa thất bại, giữ nguyên mã QR và danh tính sản phẩm. Cần `g++` như các bộ host test firmware khác.
