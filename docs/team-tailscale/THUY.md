# Thủy — web quản trị và Expo/mobile

IP của bạn: **100.109.158.8**. Chờ Cường báo backend READY và seed xong. Bạn không chạy Java, MySQL, broker hoặc AI. Nhận source mới nhất và thuy.zip, giải nén vào `.local/received/thuy` (role.json trực tiếp trong đó).

Cài Tailscale, Node 22.13+/24.3+ hoặc 26+, Python 3.11. SDK Expo hiện tại là 58; không dùng Node 25. Cài và cấu hình một lần:

```powershell
cd D:\DEV\IOT
tailscale ip -4
Test-NetConnection 100.95.248.100 -Port 8080
py -3.11 -m venv .local/venv
.\.local\venv\Scripts\python.exe -m pip install -r scripts/requirements-local.txt
.\.local\venv\Scripts\python.exe scripts/team_handoff.py install --role thuy --bundle .local/received/thuy
Push-Location admin-web
npm.cmd ci
npm.cmd run build
Pop-Location
Push-Location IOT_mobile
npm.cmd ci
Pop-Location
```

Build admin ghi file vào `smart-access-control-backend/src/main/resources/static/admin`; đó là thư mục asset mà web server Python trên máy bạn phục vụ, không phải yêu cầu chạy backend Java.

PowerShell Run as Administrator, một lần:

```powershell
cd D:\DEV\IOT
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/team-firewall.ps1 -Role thuy
```

Hai cửa sổ riêng ở gốc repo:

```powershell
# A: web admin + chuyển tiếp API về Cường
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-team.ps1 -Service web
```

```powershell
# B: Expo Go + web mobile
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-team.ps1 -Service expo
```

Gửi nhóm:

- Web admin: **http://100.109.158.8:8080/admin/index.html**.
- Expo Go: **exp://100.109.158.8:8081**.
- Web mobile: **http://100.109.158.8:8081**.

`IOT_mobile/.env` do install tạo có API `http://100.95.248.100:8080`: Expo Go native gọi trực tiếp Cường. Bản web tự dùng hostname trình duyệt với port 8080, nên gọi `100.109.158.8:8080` qua API proxy máy bạn; cookie đăng nhập không bị lệch site. Phải bật cả web proxy lẫn Expo nếu dùng web mobile. Không sửa client để trỏ web sang IP Cường, và không sửa SameSite cookie để chữa lỗi.

Kiểm tra:

```powershell
Invoke-RestMethod http://100.109.158.8:8080/api/health
```

Phải trả READY từ Cường; mở web admin thấy trang đăng nhập, không có 502. Nếu admin trắng, build lại admin và kiểm tra đường dẫn asset; nếu 502, kiểm tra Cường/Firewall/Tailscale. Nếu Expo Go không mở, điện thoại phải bật Tailscale trong cùng tailnet và Expo Go tương thích SDK 58; dùng development build nếu client cài trên điện thoại chưa hỗ trợ SDK này. Không cần đổi IP LAN của Cường/Hợp trong cấu hình Expo.

Hằng ngày chỉ chạy A và B; không install lại hoặc sửa QR. Giữ máy không sleep. Bằng đăng nhập admin từ trình duyệt trên máy Bằng, bạn chỉ cần giữ web và Expo hoạt động.
