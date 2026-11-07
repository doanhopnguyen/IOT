# Smart Door — Hệ thống kiểm soát ra vào thông minh (IoT)

Đồ án kết thúc học phần IoT — nhóm 09. Cửa thông minh trên ESP32-S3 mở bằng **PIN, thẻ RFID, vân tay, khuôn mặt** hoặc **mở từ xa** qua app; backend lưu lịch sử, telemetry, sinh cảnh báo tự động và cho chủ cửa quản lý thành viên, cấu hình cửa từ xa.

## Kiến trúc

```
 Thiết bị (Perception)          Mạng (Network)              Ứng dụng (Application)
┌─────────────────────┐     ┌──────────────────┐     ┌──────────────────────────────┐
│ ESP32-S3 + TFT,     │     │                  │     │ Backend Spring Boot (8080)   │
│ RC522, vân tay,     │◄───►│ Mosquitto MQTT   │◄───►│  REST + phiên/CSRF, Flyway   │──► MySQL
│ servo, công tắc từ  │Wi-Fi│ (xác thực + ACL) │     │  quy tắc cảnh báo, telemetry │
└─────────────────────┘     └──────────────────┘     └──────────────┬───────────────┘
 Face node (laptop+webcam) ──── MQTT ──────┘                        │ HTTP
                                                     App Expo (Android/iOS/Web), Web admin
```

- **Giao thức thiết bị** (topic `smartdoor-iot/{UID}/…`): thiết bị gửi `status` (heartbeat 5 s, kèm RSSI/heap/uptime/phiên bản), `access`, `ack`, `face`; backend gửi `cmd`, `config` (danh sách quyền + tham số cửa), `ack-confirm`, `access-ack`. Mỗi bản tin thiết bị kèm khóa thiết bị; broker chỉ cho mỗi thiết bị dùng topic của chính nó.
- **Hoạt động offline**: thiết bị giữ danh sách quyền cục bộ, vẫn mở bằng PIN/RFID/vân tay khi mất mạng và gửi bù lịch sử khi có mạng lại.

## Cấu trúc thư mục (đề bài mục 8.1)

| Thư mục | Nội dung |
|---|---|
| `firmware/` | Firmware ESP32-S3 (PlatformIO): `connected_door` (bản chính), `maintenance` (bảo trì cảm biến) |
| `hardware/` | BOM, sơ đồ chân, lưu ý lắp ráp |
| `smart-access-control-backend/` | Backend Spring Boot + migration Flyway + Dockerfile |
| `admin-web/` | Web quản trị (build vào backend `/admin`) |
| `IOT_mobile/` | App Expo dùng chung cho chủ cửa và thành viên (Android/iOS/Web) |
| `face-node/` | Nút nhận diện khuôn mặt chạy trên máy tính có camera |
| `infra/mosquitto/` | Cấu hình broker (LAN và TLS), ACL theo UID |
| `deployment/` | `docker-compose.yml` chạy MySQL + Mosquitto + backend |
| `scripts/` | Cấp phát thiết bị qua USB, đo phi chức năng, kiểm thử bảo mật broker |
| `tests/` | Mục lục và cách chạy toàn bộ kiểm thử |
| `docs/` | Đặc tả luồng, hướng dẫn triển khai, kết quả kiểm thử |

## Chạy nhanh bằng Docker

```bash
cp deployment/.env.example deployment/.env      # điền mật khẩu
docker compose -f deployment/docker-compose.yml --env-file deployment/.env up -d --build
curl http://localhost:8080/api/health           # {"status":"READY",...}
```

Web admin: `http://localhost:8080/admin/index.html` (tạo admin đầu tiên bằng `scripts/bootstrap_local.py seed` hoặc chèn tài khoản `is_admin=true`). App: `cd IOT_mobile && npm ci && npx expo start --web` với `EXPO_PUBLIC_API_BASE_URL=http://<IP máy chủ>:8080`.

Chạy từ đầu trên Windows, nhiều ESP32/mobile/Edge AI ở các mạng khác nhau: xem [hướng dẫn Tailscale và gateway](docs/CHAY_TU_DAU_TAILSCALE.md). Cài môi trường: [docs/HUONG_DAN_MAY_PHAT_TRIEN.md](docs/HUONG_DAN_MAY_PHAT_TRIEN.md).

Sau lần xóa dữ liệu và nạp lại chip: làm theo [hướng dẫn từng bước từ trạng thái sạch](docs/CHAY_LAI_SAU_RESET_TAILSCALE.md). [Báo cáo rà soát mobile/admin và kiểm thử hệ thống](docs/RA_SOAT_VA_KIEM_THU_HE_THONG_2026-11-07.md) ghi kết quả mới nhất và phạm vi phần cứng đã xác nhận.

## Thiết bị

1. Lắp theo [hardware/README.md](hardware/README.md); nạp `cd firmware && pio run -c platformio.connected.ini -t upload`.
2. Admin đăng ký chip (MAC) trên web admin → tải file cấp phát → tạo tài khoản MQTT (`scripts/configure_local_device.py`) → ghi vào chip (`scripts/device_tool.py provision`). Chi tiết: [docs/HUONG_DAN_TRIEN_KHAI.md](docs/HUONG_DAN_TRIEN_KHAI.md).
3. Người dùng quét QR, chọn Wi-Fi qua `http://192.168.4.1`, rồi trở lại app kiểm tra cửa online. Sau đó app nhận cửa/đặt tên và hai PIN; chip mới bắt đầu hiệu chỉnh cảm ứng/cảm biến, app hiển thị hướng dẫn theo tiến độ. Quản lý cửa có đổi Wi-Fi và khôi phục mạng; xem [luồng thiết lập hiện tại](docs/THIET_LAP_APP_VA_WIFI.md).

## Chức năng chính

Firmware connected 1.11.0 đã tích hợp bàn phím HX-543 phía trong nhà dùng chung PIN cửa: nhập 6 số + `#`, `*` xóa. Giới hạn nhập sai, bật/tắt PIN từ app, trạng thái hạn chế và tự khóa đều dùng chung với TFT. Xem [hướng dẫn bàn phím trong nhà](docs/BAN_PHIM_TRONG_NHA.md).

| Nhóm | Chức năng |
|---|---|
| Tài khoản & thiết bị | Đăng ký/đăng nhập, admin đăng ký chip + QR kích hoạt, nhận cửa, reset/chuyển giao có xác minh |
| Quản lý cửa & quyền | Lời mời thành viên, quyền theo phương thức (RFID/vân tay/khuôn mặt/mở từ xa), PIN, đăng ký vân tay/thẻ từ xa, **cài đặt cửa từ xa** (thời gian mở, ngưỡng cửa mở, bật/tắt phương thức) |
| Giám sát | Lịch sử ra vào, **telemetry** (RSSI, bộ nhớ, trạng thái cửa/cảm biến), **biểu đồ 7 ngày**, **xuất CSV**, dashboard admin |
| Cảnh báo | Tự sinh: mất kết nối, cửa mở quá lâu, bị từ chối liên tục, lỗi cảm biến vân tay; chống trùng, tự đóng; chủ cửa đánh dấu đã xem/đã xử lý |
| Khuôn mặt | Hồ sơ khuôn mặt dùng chung, chủ cửa duyệt theo cửa, nhận diện có kiểm tra người thật |

## Kiểm thử

Xem [tests/README.md](tests/README.md). Kết quả: [docs/KET_QUA_KIEM_THU.md](docs/KET_QUA_KIEM_THU.md). CI: `.github/workflows/ci.yml` (backend, mobile, Python, build firmware).

## Bảo mật

- Không commit bí mật: `.env`, `.local/`, file cấp phát thiết bị đều trong `.gitignore`; chỉ có `*.env.example`.
- Broker bắt buộc đăng nhập, ACL theo UID; thiết bị xác thực thêm bằng khóa thiết bị trong từng bản tin. Triển khai qua Internet dùng MQTT TLS (`infra/mosquitto/compose.tls.yml`).
- Web dùng phiên HttpOnly + CSRF; quyền kiểm tra theo từng cửa ở backend.
