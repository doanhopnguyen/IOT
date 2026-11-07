# Phần cứng — bộ điều khiển cửa Smart Door

## Danh sách linh kiện (BOM)

| # | Linh kiện | Số lượng | Ghi chú |
|---|---|---|---|
| 1 | ESP32-S3 DevKitC-1 **N16R8** (16 MB flash, 8 MB PSRAM OPI) | 1 | Bộ điều khiển chính, Wi-Fi 2.4 GHz |
| 2 | Màn hình TFT ILI9341 2.4–2.8" có cảm ứng XPT2046 | 1 | Bàn phím PIN, hiệu chỉnh tại chỗ, QR kích hoạt |
| 3 | Đầu đọc RFID RC522 (13.56 MHz) + thẻ/móc khóa Mifare | 1 | **Nguồn 3.3 V**, không cấp 5 V |
| 4 | Cảm biến vân tay UART (dòng R30x/AS608, 57600 baud) | 1 | Lưu mẫu trong bộ nhớ riêng của cảm biến |
| 5 | Servo SG90 (hoặc chốt điện + relay) | 1 | Cần nguồn 5 V riêng đủ dòng, GND chung |
| 6 | Công tắc từ (reed switch) cửa | 1 | Hai dây: GPIO6 và GND (INPUT_PULLUP) |
| 7 | Bàn phím ma trận HX-543 4×4 | 1 | 8 dây tín hiệu, không cần cấp nguồn riêng |
| 8 | Nguồn 5 V ≥ 2 A + dây, breadboard/PCB | 1 | Nguồn USB máy tính dễ sụt áp khi servo/vân tay chạy |
| 9 | (Tùy chọn) Laptop + webcam chạy `face-node` | 1 | Nhận diện khuôn mặt, không chạy trên ESP32 |

## Sơ đồ chân (firmware `connected_door` / `offline_door`)

| Thiết bị | Chân thiết bị | GPIO ESP32-S3 |
|---|---|---|
| SPI dùng chung | SCK / MOSI / MISO | 41 / 42 / 21 |
| TFT ILI9341 | CS / DC / RST | 47 / 2 / 1 |
| Cảm ứng XPT2046 | T_CS | 48 |
| RC522 | SDA(CS) / RST | 10 / 9 |
| Vân tay (UART2) | TX cảm biến → RX ESP / RX cảm biến ← TX ESP | 17 / 18 |
| Servo | Tín hiệu | 4 |
| Công tắc từ | Hai dây | 6 và GND |
| HX-543 | Chân 1 — Cột 4 (A/B/C/D) | 38 |
| HX-543 | Chân 2 — Cột 3 (3/6/9/#) | 15 |
| HX-543 | Chân 3 — Cột 2 (2/5/8/0) | 14 |
| HX-543 | Chân 4 — Cột 1 (1/4/7/*) | 13 |
| HX-543 | Chân 5 — Hàng 4 (* / 0 / # / D) | 12 |
| HX-543 | Chân 6 — Hàng 3 (7/8/9/C) | 11 |
| HX-543 | Chân 7 — Hàng 2 (4/5/6/B) | 8 |
| HX-543 | Chân 8 — Hàng 1 (1/2/3/A) | 7 |

Đánh số HX-543 theo ảnh kiểm tra: nhìn từ mặt phím, cáp hướng xuống; chân 1 ở bên phải cạnh chấm trắng, chân 8 ở bên trái. Đây là bàn phím ma trận thụ động: chỉ nối 8 đường tín hiệu theo bảng, không nối VCC/3V3/5V/GND vào cáp. Sơ đồ hàng/cột này đã được xác nhận bằng sketch test riêng.

Sơ đồ khối:

```
           ┌──────────── SPI (41/42/21) ───────────┐
           │                 │                     │
      TFT+Touch (47,2,1,48)  RC522 (10,9)          │
           │                                       │
   ESP32-S3 N16R8 ── UART2 (17/18) ── Cảm biến vân tay
           │ GPIO4 ── Servo SG90 (nguồn 5 V riêng, GND chung)
           │ GPIO6 ── Công tắc từ ── GND
           │ GPIO7/8/11/12/13/14/15/38 ── HX-543 (chân 8/7/6/5/4/3/2/1)
           └── Wi-Fi 2.4 GHz ── MQTT broker ── Backend Spring Boot ── App/Web
```

## Lưu ý khi lắp

- ESP32-S3 DevKit có **2 cổng USB-C**: cổng **UART** (chip CH343/CP210x) để nạp; cổng **USB** (USB-CDC) để xem log và cấp phát bằng `scripts/device_tool.py` (firmware build với `ARDUINO_USB_CDC_ON_BOOT=1`).
- Nạp không vào được: giữ **BOOT**, nhấn/thả **RST**, thả BOOT rồi nạp lại.
- Dây vân tay lỏng làm `fingerReady` nhảy true/false; firmware đọc bảng ô nhớ tối đa 3 lần và có cảnh báo `SENSOR_FAULT` khi lỗi kéo dài > 60 s.
- SG90 không có phản hồi vị trí: ACK của thiết bị xác nhận lệnh, không chứng minh chốt đã chạy — kiểm tra cơ khí riêng.
- Xóa flash ESP32 **không** xóa mẫu vân tay trong cảm biến; dùng firmware bảo trì `platformio.maintenance.ini` + `scripts/sensor_maintenance.py --erase`.

## Nạp firmware

```
cd firmware
pio run -c platformio.connected.ini -t upload --upload-port COMx
```

Cấp phát (ghi danh tính + broker + Wi-Fi tùy chọn) xem `docs/HUONG_DAN_TRIEN_KHAI.md`.
