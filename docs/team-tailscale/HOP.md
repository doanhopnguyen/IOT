# Hợp — ESP32, người dùng và edge AI

IP Tailscale của bạn: **100.111.90.116**. Laptop này không chạy backend Java, MySQL, face processor server :8091 hoặc MQTT broker. Bạn giữ thiết bị và chạy camera edge tại cửa.

Chip được nạp lại firmware **2.0.5-demo**, xóa flash cũ và kho vân tay, rồi cấp lại danh tính nhà máy. Sau bàn giao chỉ có QR/SSID/mật khẩu AP xuất xưởng: chưa chọn Wi-Fi, chưa có PIN, thẻ, vân tay hoặc chủ cửa. UID giữ theo phần cứng: `ESP32-80B54EC8149C`; mã kích hoạt và secret là bộ mới, khớp SQL gửi Cường. Không nhận cửa trên backend cũ.

## Trước khi bắt đầu

Gửi **cuong.zip** + gói model cho Cường, **thuy.zip** cho Thủy, **bang.zip** cho Bằng. Mỗi người có source mới nhất. Giữ hop.zip trên máy mình. Gói riêng có secret, không đưa lên Git. Chờ Cường hoàn tất SQL và Thủy bật web/Expo.

Không chạy `scripts/start-local.ps1 -Component backend/broker/face-api` nữa. Nếu dịch vụ cũ đang giữ port 8080/1884, dừng đúng cửa sổ cũ bằng Ctrl+C trước khi bật gateway. Dịch vụ MySQL hệ thống có thể vẫn cài nhưng không phục vụ demo này; không cần xóa database cũ.

Cài Python 3.11, Tailscale, dependency và model nếu máy mới; máy hiện tại đã có môi trường AI:

```powershell
cd D:\DEV\IOT
# Chỉ khi chưa có .local/venv:
# py -3.11 -m venv .local/venv
# .\.local\venv\Scripts\python.exe -m pip install -r scripts/requirements-local.txt -r face-node/requirements.txt
.\.local\venv\Scripts\python.exe scripts/team_handoff.py install --role hop --bundle .local/received/hop
```

Nếu chưa giải nén hop.zip, giải nén sao cho role.json nằm trong `.local/received/hop`. Các file FACTORY/connection chỉ dùng khi bảo trì USB, không chạy provision lần nữa trên chip đang cấp phát.

## Cầu nối cho chip — chạy trước khi chọn Wi-Fi

IP Wi-Fi Hợp lúc bàn giao: **10.18.0.194**. Kiểm tra IP này vẫn nằm trên card Wi-Fi đang cùng mạng với ESP32:

```powershell
Get-NetIPAddress -AddressFamily IPv4 | Select-Object InterfaceAlias,IPAddress
Test-NetConnection 100.95.248.100 -Port 1884
Test-NetConnection 100.95.248.100 -Port 8080
```

Không dùng IP VMware 192.168.40.1/192.168.80.1 hoặc IP Tailscale làm gateway LAN cho chip. Hai laptop ở Wi-Fi khác nhau không sao; chip chỉ cần cùng LAN với laptop Hợp. Mạng guest/client-isolation sẽ chặn đường này.

PowerShell Run as Administrator một lần:

```powershell
cd D:\DEV\IOT
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/team-firewall.ps1 -Role hop -HopLan 10.18.0.194
```

Hai cửa sổ riêng tại gốc repo:

```powershell
# A: chuyển tiếp MQTT, không phải một MQTT broker khác
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-team.ps1 -Service mqtt-gateway
```

```powershell
# B: chuyển tiếp HTTP cho ESP32 tải firmware OTA
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-team.ps1 -Service ota-gateway
```

A: `10.18.0.194:1884 → 100.95.248.100:1884`. B: `10.18.0.194:8080 → 100.95.248.100:8080`. Chỉ hai relay TCP, không có Java/DB/Mosquitto trên máy bạn.

## App người dùng và nhận cửa từ QR

1. Trên điện thoại bật Tailscale cùng tailnet; dùng Expo Go tương thích SDK 58 và mở **exp://100.109.158.8:8081**. Có thể dùng web mobile **http://100.109.158.8:8081** để thử khi không dùng camera quét QR.
2. Tự đăng ký tài khoản người dùng Hợp, đăng nhập tài khoản đó; không dùng tài khoản admin hệ thống của Bằng làm chủ cửa demo.
3. Quét QR hiện trên chip. Nếu hệ điều hành chỉ hiểu phần Wi-Fi, mở luồng quét QR sản phẩm trong app; QR sản phẩm và QR Expo là hai mã khác nhau.
4. Kết nối AP SmartDoor-C8149C theo QR, mở **http://192.168.4.1** để chọn Wi-Fi 2.4 GHz của mạng cùng LAN laptop Hợp. Không cài cố định mật khẩu Wi-Fi trong source. Khi nối AP chip có thể tạm mất đường tới backend; chọn Wi-Fi rồi trở lại mạng bình thường/Tailscale để hoàn tất nhận cửa.
5. App dùng mã activation trong QR để nhận cửa trên DB Cường. Hoàn tất PIN mở cửa và PIN admin khác nhau, hiệu chỉnh cảm ứng/cảm biến theo hướng dẫn. Góc servo chỉnh riêng, app/TFT hiển thị 0–90°.
6. Chờ chip báo READY, MQTT online và Bằng thấy thiết bị được nhận. Chỉ sau đó thử mở/khóa. Khóa từ xa quay servo về 0° ngay; tự khóa vẫn theo chế độ đã chọn.

Không cần Cường có thiết bị USB: SQL đã tạo đúng inventory và hash; chip xác thực khi tới được broker. Nếu báo mã đã dùng/không tồn tại, dừng và đối chiếu đúng bộ SQL/QR, không tạo mã mới tùy tiện.

## Edge AI tại cửa — sau khi setup READY

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-edge-ai.ps1
```

Mở **http://127.0.0.1:8092** trên chính laptop Hợp. Nhập máy chủ **http://100.95.248.100:8080**, đăng nhập tài khoản chủ cửa Hợp, chọn cửa vừa nhận, chọn camera laptop rồi ghép/bật nhận diện. Dùng portal để cấp camera mới cho DB Cường; không dùng .env/secret camera cũ. Nếu portal hiện kết nối cũ, dừng/đăng xuất kết nối cũ rồi ghép với địa chỉ server Cường.

Portal chạy :8092 là UI/worker camera cục bộ, không phải backend server. Edge tải quyền qua HTTP, gửi kết quả nhận diện có xác minh người thật về backend; backend mới quyết định và gửi lệnh MQTT cho cửa. Không bật FACE_ALLOW_UNVERIFIED_LIVENESS để bỏ qua kiểm tra. Đăng ký khuôn mặt bằng ảnh/video trên app dùng processor của Cường; camera mở cửa dùng edge của bạn, là hai luồng khác nhau.

## Đổi IP LAN

Ưu tiên giữ DHCP reservation 10.18.0.194. Nếu bắt buộc đổi IP:

1. Dừng hai gateway, sửa trường `lan` trong `.local/team/role.json`, thêm lại Firewall với -HopLan mới và bật lại gateway.
2. Cường sửa APP_DEVICE_BASE_URL sang IP LAN mới, restart backend.
3. mqttHost đã cấp trong chip cũng phải đổi. Chỉ sửa file connection trên laptop không cập nhật chip. Không xóa factory/QR để đổi IP tùy tiện; nhờ người bảo trì cấp lại cùng bộ danh tính qua quy trình reset/provision hoặc giữ nguyên địa chỉ bằng DHCP. Không cần tạo lại SQL/activationCode nếu dùng lại đúng bộ danh tính và chip chưa được nhận.

Giữ laptop có điện, không sleep, Tailscale online và hai gateway chạy. Thiếu gateway: app có thể vào được server nhưng chip vẫn offline. Bản bàn giao không thể tự xác nhận máy Cường/Thủy đã mở Firewall; phải chạy Test-NetConnection trước khi chọn Wi-Fi.
