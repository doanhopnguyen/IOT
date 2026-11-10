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

Hướng dẫn chạy lại và chuyển kết nối sang laptop Cường, cập nhật 10/11/2026.

### C1. Cường bật máy chủ trước

Trên máy Cường, bật MySQL, MQTT, backend và face-api theo [hướng dẫn máy Cường](CUONG.md). Kiểm tra tại máy Cường:

```powershell
Invoke-RestMethod http://127.0.0.1:8080/api/health
```

Kết quả cần có `status = READY`. Backend phục vụ Hợp qua cổng `8080`; face-api `8091` phục vụ xử lý ảnh đăng ký tại máy Cường.

### C2. Hợp kiểm tra đường tới máy Cường

Bật Tailscale trên cả hai laptop, vào cùng tailnet. Trên laptop Hợp mở PowerShell:

```powershell
cd D:\DEV\IOT
Test-NetConnection 100.95.248.100 -Port 8080
Invoke-RestMethod http://100.95.248.100:8080/api/health
```

Chỉ tiếp tục khi `TcpTestSucceeded = True` và API trả `status = READY`. Nếu IP Tailscale máy Cường đã đổi, lấy IP mới bằng `tailscale ip -4` **trên máy Cường**, rồi thay địa chỉ trong lệnh kiểm tra và ô máy chủ ở C4.

Nếu máy Cường gọi local được nhưng Hợp gọi không được, Cường kiểm tra backend đang lắng nghe cổng 8080 và chạy PowerShell **Run as Administrator** để thiết lập firewall theo dự án:

```powershell
cd D:\DEV\IOT
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/team-firewall.ps1 -Role cuong
```

Script firewall hiện dùng IP Cường `100.95.248.100`; nếu IP đã đổi phải cập nhật địa chỉ vai trò `cuong` trong script trước. Kiểm tra thêm ACL/grants của tailnet cho phép laptop Hợp tới máy Cường TCP `8080`.

### C3. Chạy lại Smart Door AI trên laptop Hợp

```powershell
cd D:\DEV\IOT
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-edge-ai.ps1
```

Cũng có thể nhấp đúp `Smart Door AI.cmd`. Launcher mở **http://127.0.0.1:8092** trên chính laptop Hợp; nếu portal đã chạy, launcher dùng lại tiến trình đó. Không chạy thêm `node.py --camera` vì hai tiến trình có thể tranh webcam.

Nếu báo chưa có Python AI, chuẩn bị một lần:

```powershell
cd D:\DEV\IOT
py -3.11 -m venv .local\venv
.\.local\venv\Scripts\python.exe -m pip install -r face-node\requirements.txt
```

Nếu chưa có model, giải nén gói `AI-MODELS.zip` nhóm đã chuẩn bị vào gốc repo. Kiểm tra có `face-node/models/models/buffalo_l/det_10g.onnx`, `face-node/models/models/buffalo_l/w600k_r50.onnx` và `face-node/models/addons/liveness.onnx`, rồi chạy lại launcher.

### C4. Sửa kết nối cũ để trỏ tới laptop Cường

1. Mở **http://127.0.0.1:8092**. Nếu đang đăng nhập/kết nối máy chủ cũ, bấm **Đăng xuất và dừng AI**.
2. Ở màn hình đăng nhập, mở **Kết nối máy chủ Smart Door** và sửa **Địa chỉ máy chủ** thành **`http://100.95.248.100:8080`**. `127.0.0.1:8092` là giao diện trên Hợp; địa chỉ máy chủ phải là IP của Cường, không thêm `/api` vào ô này.
3. Nhập email/số điện thoại và mật khẩu **tài khoản chủ cửa của Hợp trên backend Cường**, cùng tài khoản đang dùng trên app. Tài khoản từng tạo ở backend cũ trên Hợp có thể chưa tồn tại ở database Cường.
4. Chọn đúng cửa trong danh sách hoặc nhập mã `SD-…` từ **Cài đặt cửa → Nhận diện bằng laptop** trên app. Không dùng mã QR xuất xưởng hay UID `ESP32-80B54EC8149C` vào ô mã cửa.
5. Mở **Camera và tùy chọn ghép nối**, chọn **Camera mặc định**; thử camera thứ hai/thứ ba nếu dùng webcam USB. Nếu báo cửa đã có camera khác và muốn thay camera đó, chọn **Thay camera cũ bằng laptop này**. Camera cũ sẽ ngừng hoạt động.
6. Giữ **Tự chạy lại khi mở Smart Door AI trên laptop này** nếu muốn dùng lại kết nối ở các lần sau. Bấm **Kết nối cửa và bật AI**.
7. Khi cửa online và hoàn tất thiết lập, portal chuyển sang **Đang nhận diện**, cửa sổ **Smart Door – Face Check** mở. Nếu hiện **Đang chờ cửa**, kiểm tra trạng thái cửa, PIN và hiệu chỉnh trên app/ESP32.

**Không cần sửa mã Python để chuyển server.** Portal lưu địa chỉ và danh tính camera vào `.local/edge-ai/connections.json`, rồi tự cấp `FACE_API_URL` và `FACE_EVENT_TRANSPORT=http` cho tiến trình nhận diện. Chỉ đổi `FACE_API_URL` trong `face-node/.env` không cập nhật kết nối camera đã lưu; cần thực hiện lại C4. Không chép secret của ESP32 vào cấu hình camera.

### C5. Kiểm tra nhận diện và chạy hằng ngày

Trên app đang nối backend Cường, đăng ký khuôn mặt và cấp quyền khuôn mặt tại cửa cho người thử. Đứng trước camera, đủ sáng, chỉ một người trong khung. Kiểm tra cả kết quả nhận diện, trạng thái mở thực tế và lịch sử trên app.

Edge AI gửi kết quả nhận diện cho backend qua HTTP (Tailscale). Backend quyết định có mở cửa không và gửi lệnh MQTT cho chip. Không bật `FACE_ALLOW_UNVERIFIED_LIVENESS`.

Đăng ký khuôn mặt bằng ảnh/video trên app do máy Cường xử lý. Camera mở cửa do laptop của bạn xử lý. Đây là hai luồng khác nhau.

Những lần sau: Cường bật server → Hợp bật Tailscale → chạy launcher. Nếu đã ghép và bật tự chạy lại, kết nối được dùng lại. Nếu đã bấm **Dừng nhận diện**, cần kết nối/bật AI lại trên portal. Đóng tab trình duyệt vẫn để AI chạy; dùng nút **Dừng nhận diện** để dừng.

### C6. Nếu chưa chạy được

| Hiện tượng | Cách xử lý |
|---|---|
| Không vào được `127.0.0.1:8092` | Chạy lại launcher; kiểm tra log portal bên dưới. |
| Hợp không gọi được API Cường | Làm C2; Cường kiểm tra backend, firewall và Tailscale ACL/grants. |
| Đăng nhập lỗi hoặc danh sách cửa trống | Xác nhận ô máy chủ đúng IP Cường, tài khoản tồn tại ở DB Cường và tài khoản đó là chủ cửa. |
| Cửa đã có camera khác / lỗi 409 | Đăng nhập lại nếu được yêu cầu, chọn thay camera cũ khi muốn chuyển sang laptop này, rồi ghép lại. |
| Sau reset cửa, camera báo mất quyền hoặc không tồn tại | Nhận và thiết lập cửa lại trên app trước, sau đó đăng xuất/ghép lại theo C4 với mã cửa hiện tại. |
| Camera không mở hoặc AI báo lỗi | Đóng ứng dụng đang giữ webcam; bật quyền camera cho ứng dụng desktop trong Windows; thử camera khác và xem `worker.log`. |
| Nhận ra mặt nhưng không mở cửa | Kiểm tra quyền khuôn mặt tại đúng cửa, xác minh người thật, trạng thái cửa và kết nối ESP32 tới broker Cường; xem lịch sử/log backend. |

Đọc log trên laptop Hợp (chỉ đọc file đang có):

```powershell
Get-Content .local\edge-ai\portal.err.log -Tail 60
Get-Content .local\edge-ai\worker.log -Tail 80
```

Không gửi `.local/edge-ai/connections.json` lên nhóm hoặc Git vì chứa secret camera. Hướng dẫn này đối chiếu với mã nguồn; kết nối thực tế cần xác nhận bằng bước C2 và thử cửa ở C5.

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
