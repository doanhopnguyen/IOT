# Kiểm thử

Mã test nằm cạnh từng thành phần; thư mục này là mục lục và cách chạy toàn bộ. CI (`.github/workflows/ci.yml`) chạy cùng các lệnh này.

| Thành phần | Vị trí | Lệnh | Nội dung chính |
|---|---|---|---|
| Backend (unit + tích hợp H2 + MockMvc) | `smart-access-control-backend/src/test` | `cd smart-access-control-backend && mvn test` | Phân quyền chủ cửa/thành viên/admin, lệnh thiết bị + ACK, vân tay, telemetry, quy tắc cảnh báo, thống kê/CSV, cài đặt cửa, kích hoạt/reset |
| Tích hợp MySQL thật | cùng thư mục, đang `@Disabled`/skip khi không có MySQL | như trên với DB thật | 10 bài bỏ qua trong CI |
| Mobile | `IOT_mobile/tests` | `cd IOT_mobile && npm run typecheck && npm test` | API client, phân quyền theo cửa, lịch sử, biểu đồ, cài đặt, cảnh báo |
| Face node | `face-node/tests` | `cd face-node && python -m unittest discover -s tests -p "test_*.py"` | Ngưỡng nhận diện, cache mẫu, cổng quyết định |
| Script | `scripts/tests` | `python -m unittest discover -s scripts/tests -p "test_*.py"` | Đo độ trễ (percentile), đọc MAC USB |
| Firmware | `firmware` | `pio run -c platformio.connected.ini` | Biên dịch; kiểm thử chức năng thực hiện trên thiết bị thật |

## Kiểm thử phi chức năng và bảo mật (trên thiết bị thật)

- Độ trễ lệnh: mở cửa từ xa ~30 lần rồi `python scripts/measure_nfr.py --since <giờ bắt đầu>` → bảng p50/p95/max.
- Bảo mật broker: `python scripts/broker_security_check.py --host <IP> --port 1884 --uid <UID thiết bị>` → không cho kết nối ẩn danh/sai mật khẩu, thiết bị không đọc/ghi topic của thiết bị khác.
- Kết quả và nhận xét ghi vào `docs/KET_QUA_KIEM_THU.md`.
