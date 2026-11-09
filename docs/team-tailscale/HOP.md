# Hợp — ESP32, app người dùng và Edge AI

Bản cập nhật 09/11/2026, thay cho HOP.md trong `hop.zip`.

IP Tailscale của bạn: **100.111.90.116**. Bạn giữ ESP32, dùng app với vai trò chủ cửa và chạy camera Edge AI tại cửa. Laptop này **không** chạy backend, MySQL, MQTT broker hay gateway.

## Thay đổi so với bản cũ

ESP32 không còn đi nhờ qua laptop của bạn. Chip kết nối **thẳng tới broker của Cường qua Internet** bằng một tên miền cố định:

```
Trước: ESP32 ──LAN──▶ laptop Hợp (gateway 10.18.0.194) ──Tailscale──▶ broker Cường
Nay:   ESP32 ──Internet, TLS──▶ desktop-s2r046u.tailad91e1.ts.net:8443 ──▶ broker Cường
```

| Bản cũ | Bản mới |
|---|---|
| Chạy `mqtt-gateway` và `ota-gateway` | **Bỏ**, không chạy nữa |
| ESP32 phải cùng Wi-Fi với laptop Hợp | ESP32 dùng Wi-Fi nào có Internet cũng được |
| Laptop Hợp phải bật để chip online | Chỉ cần máy Cường bật |
| Đổi mạng phải sửa role.json, firewall, backend.env, chip | Không phải sửa gì |
| OTA tải qua `http://10.18.0.194:8080` | OTA tải qua `https://desktop-s2r046u.tailad91e1.ts.net` |

UID `ESP32-80B54EC8149C`, secret, mã QR và mật khẩu MQTT của chip **giữ nguyên**. DB trên máy Cường không phải sửa.

Để chuyển, bạn phải nạp lại chip qua USB **một lần** (phần A). Làm trước khi quét QR nhận cửa.

## Cần chuẩn bị

- Source mới nhất của repo, ví dụ `D:\DEV\IOT`. Mọi lệnh dưới đây chạy tại thư mục gốc repo.
- Gói `hop.zip` cũ. Trong đó có **factory JSON** (danh tính chip) và **connection JSON** (cấu hình broker).
- File **`ts-ca.pem`** do Cường gửi. File này chứa chứng chỉ gốc ISRG Root X1 và X2 của Let's Encrypt, là chứng chỉ công khai, không phải bí mật.
- ESP32 cắm USB (mặc định `COM5`), PlatformIO, Python 3.11 với `.local/venv` đã cài `scripts/requirements-local.txt` và `face-node/requirements.txt`.
- Tailscale đã vào tailnet chung của nhóm, đúng IP `100.111.90.116`.

Đặt file riêng vào một thư mục, **không đưa vào Git**:

```
.local\received\hop\factory.json      ← factory JSON trong hop.zip
.local\received\hop\connection.json   ← connection JSON trong hop.zip
.local\received\hop\ts-ca.pem         ← Cường gửi
```

Đổi tên file trong các lệnh nếu file của bạn tên khác.

Nếu máy còn chạy gateway cũ (`mqtt-gateway`, `ota-gateway`), dừng cửa sổ đó bằng Ctrl+C.

---

## A. Nạp lại ESP32 (một lần)

### A1. Kiểm tra máy chủ của Cường

Máy Cường phải đang bật. **Tắt Tailscale** trên laptop để thử đúng như ESP32 (đi qua Internet), rồi chạy:

```powershell
Test-NetConnection desktop-s2r046u.tailad91e1.ts.net -Port 8443
Test-NetConnection desktop-s2r046u.tailad91e1.ts.net -Port 443
```

Cả hai phải ra `TcpTestSucceeded : True`. Nếu ra `False`, báo Cường và dừng ở đây.

Bật lại Tailscale sau khi kiểm tra.

### A2. Tạo connection JSON mới

Lệnh dưới đây đọc connection JSON cũ, đổi địa chỉ broker sang tên miền mới, bật TLS và gắn chứng chỉ. `mqttUser` và `mqttPassword` giữ nguyên, không in ra màn hình.

```powershell
@'
import json, pathlib
d = pathlib.Path(".local/received/hop")
c = json.loads((d/"connection.json").read_text(encoding="utf-8-sig"))
c.update(mqttHost="desktop-s2r046u.tailad91e1.ts.net", mqttPort=8443, mqttTls=True,
         mqttCa=(d/"ts-ca.pem").read_text(encoding="utf-8-sig").strip() + "\n")
c.pop("allowLocalPlaintext", None)
(d/"connection-funnel.json").write_text(json.dumps(c, indent=2), encoding="utf-8")
print("OK:", {k: c[k] for k in ("mqttHost", "mqttPort", "mqttTls")})
'@ | .\.local\venv\Scripts\python.exe -
```

Kết quả đúng:

```
OK: {'mqttHost': 'desktop-s2r046u.tailad91e1.ts.net', 'mqttPort': 8443, 'mqttTls': True}
```

### A3. Xóa flash và nạp lại firmware

Firmware chỉ nhận cấu hình mới khi chip **chưa có danh tính**, nên phải xóa flash trước. Thao tác này xóa Wi-Fi và cấu hình lưu trên chip. Kho vân tay nằm trong cảm biến, không bị ảnh hưởng.

Đóng Serial Monitor và mọi chương trình đang giữ cổng COM, rồi chạy:

```powershell
cd firmware
pio run -c platformio.connected.ini -t erase  --upload-port COM5
pio run -c platformio.connected.ini -e esp32-s3-ota-demo -t upload --upload-port COM5
cd ..
```

### A4. Provision: danh tính cũ + kết nối mới

```powershell
.\.local\venv\Scripts\python.exe scripts/device_tool.py --port COM5 provision `
  --device .local/received/hop/factory.json `
  --connection .local/received/hop/connection-funnel.json
.\.local\venv\Scripts\python.exe scripts/device_tool.py --port COM5 info
```

- Lệnh provision phải in `FACTORY_PROVISIONED 80B54EC8149C`, sau đó chip tự khởi động lại.
- Lệnh `info` phải có `productPrepared=1`, `generation=1`, `claimed=0`, `firmware=2.0.5-demo`.
- Nếu ra `FACTORY_REJECTED`: chip chưa được xóa sạch, hoặc file factory không khớp MAC. Làm lại A3. **Không** sửa UID, MAC hay secret.
- Nếu ra `FACTORY_STORAGE_FAILED`: báo Cường, không thử lại liên tục.

Màn hình chip trở về QR xuất xưởng. Mã QR giống hệt trước.

---

## B. App người dùng và nhận cửa

1. Trên điện thoại bật Tailscale cùng tailnet nhóm. Mở Expo Go (tương thích SDK 58) và vào **exp://100.109.158.8:8081** (Expo trên máy Thủy) hoặc **exp://100.111.90.116:8081** (nếu bật Expo trên máy Hợp).
2. Tự đăng ký **tài khoản người dùng** của Hợp và đăng nhập. Không dùng tài khoản admin của Bằng làm chủ cửa.
3. Trong app, mở chức năng quét QR sản phẩm và quét mã trên màn hình chip. QR sản phẩm khác QR của Expo.
4. Kết nối Wi-Fi phát ra từ chip (`SmartDoor-C8149C`) theo QR, mở **http://192.168.4.1** và chọn Wi-Fi cho chip. Yêu cầu với mạng này:
   - băng tần **2.4 GHz**;
   - **có Internet** và không cần đăng nhập qua trang web (Wi-Fi trường học hoặc quán cà phê có trang đăng nhập sẽ không chạy);
   - không chặn kết nối ra cổng 8443.

   **Không cần** cùng mạng với laptop. Có thể dùng hotspot điện thoại.
5. Khi đang nối Wi-Fi của chip, điện thoại tạm mất đường tới server. Chọn Wi-Fi xong, quay về mạng bình thường và bật lại Tailscale để app hoàn tất nhận cửa.
6. Đặt **PIN mở cửa** và **PIN admin** (hai mã khác nhau), hiệu chỉnh cảm ứng và cảm biến theo hướng dẫn trên app. Góc servo chỉnh riêng, hiển thị 0–90°.
7. Chờ chip báo READY và trạng thái **ONLINE** trên app. Nhờ Cường xem log broker có client `ESP32-80B54EC8149C` kết nối, và Bằng thấy thiết bị đã được nhận trên trang admin. Sau đó mới thử mở và khóa.

Nếu app báo mã đã dùng hoặc không tồn tại: dừng lại và báo Cường chạy file `CUONG-RESET-CUA.md` để đưa thiết bị về trạng thái chờ nhận (`INVENTORY`). Không tạo mã mới.

---

## C. Edge AI tại cửa (sau khi cửa READY)

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-edge-ai.ps1
```

1. Mở **http://127.0.0.1:8092** trên chính laptop Hợp.
2. Nhập máy chủ **http://100.95.248.100:8080**, đăng nhập tài khoản chủ cửa của Hợp.
3. Chọn cửa vừa nhận, chọn camera laptop, rồi ghép và bật nhận diện.
4. Nếu portal hiện kết nối cũ, đăng xuất kết nối cũ rồi ghép lại với server của Cường.

Edge AI gửi kết quả nhận diện cho backend qua HTTP (Tailscale). Backend quyết định có mở cửa không và gửi lệnh MQTT cho chip. Không bật `FACE_ALLOW_UNVERIFIED_LIVENESS`.

Đăng ký khuôn mặt bằng ảnh/video trên app do máy Cường xử lý. Camera mở cửa do laptop của bạn xử lý. Đây là hai luồng khác nhau.

---

## Chạy hằng ngày

Chờ Cường báo server READY, rồi:

1. Bật Tailscale, kiểm tra: `Test-NetConnection 100.95.248.100 -Port 8080` phải ra `True`.
2. Cấp điện cho ESP32. Chip tự kết nối Wi-Fi đã lưu và broker, không cần laptop.
3. Mở app trên điện thoại.
4. Nếu dùng camera: chạy `scripts/start-edge-ai.ps1` và bật nhận diện trên portal.

**Không** chạy lại `erase`, `upload` hay `provision` mỗi ngày. Phần A chỉ làm một lần.

## Đổi mạng Wi-Fi cho chip

Không cần nạp lại chip, không phải sửa gì ở máy Cường hay máy của bạn.

1. Trên màn hình chip chọn **ADMIN / CHANGE WI-FI** và nhập PIN admin.
2. Nối điện thoại vào Wi-Fi `SmartDoor-...` của chip, mở trang thiết lập, nhập lại PIN admin một lần, rồi chọn mạng mới (2.4 GHz, có Internet).

Chip nhớ tối đa 5 mạng đã kết nối thành công. Khi mất Wi-Fi, chip tự thử lần lượt các mạng đã nhớ, nên mang chip về lại một mạng cũ thì không phải làm gì.

## Xử lý sự cố

| Hiện tượng | Kiểm tra |
|---|---|
| Chip có Wi-Fi nhưng OFFLINE | Máy Cường có bật không? Chạy lại A1 từ một mạng khác. Wi-Fi của chip có trang đăng nhập hoặc chặn cổng 8443 không? |
| App không vào được server | Tailscale trên điện thoại có bật không? `Test-NetConnection 100.95.248.100 -Port 8080` |
| Không mở được Expo | Máy Thủy có bật Expo không? `Test-NetConnection 100.109.158.8 -Port 8081` |
| Edge AI không ghép được | Đăng nhập đúng tài khoản chủ cửa; cửa đã READY chưa |

## Bảo mật

- Không gửi `factory.json`, `connection.json`, `connection-funnel.json` hay ảnh QR lên kênh chung.
- Không đưa thư mục `.local\received\hop` vào Git.
- Nếu sau này cần quay lại gateway LAN cũ, phải xóa flash và provision lại bằng connection JSON cũ. Báo Cường trước, vì backend cũng phải đổi `APP_DEVICE_BASE_URL`.
