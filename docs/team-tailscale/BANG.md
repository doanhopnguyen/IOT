# Bằng — đăng nhập quản trị

IP máy bạn: **100.115.154.86**. Không cần chạy source, Java, MySQL, Mosquitto hoặc Expo.

1. Bật Tailscale, cùng tailnet với Cường và Thủy.
2. Chờ Cường báo backend + MQTT + AI + SQL xong; chờ Thủy báo web đã chạy.
3. Mở **http://100.109.158.8:8080/admin/index.html**.
4. Lấy email/mật khẩu từ **ADMIN_ACCESS.txt** trong bang.zip được Hợp gửi riêng. Đây là tài khoản quản trị hệ thống mới cho DB của Cường, không phải PIN trên chip.
5. Vào kho thiết bị, kiểm tra có **ESP32-80B54EC8149C**, MAC **80B54EC8149C**, trạng thái **INVENTORY**, generation **1**. Offline trước khi Hợp chọn Wi-Fi là bình thường.
6. Báo Hợp có thể quét QR trên chip để nhận cửa. Không đăng ký chip/QR lần nữa, không reset thiết bị, không cấp thiết bị khác thay thế.
7. Sau khi Hợp setup xong, kiểm tra thiết bị online và lịch sử/cảnh báo cập nhật. Chức năng quản trị hệ thống khác tài khoản chủ cửa: Hợp tự đăng ký tài khoản người dùng của mình và nhận cửa.

Nếu không mở được web, PowerShell chạy:

```powershell
tailscale ping 100.109.158.8
Test-NetConnection 100.109.158.8 -Port 8080
```

Nếu thấy 502: máy Thủy đã chạy web nhưng chưa tới được backend Cường. Nếu đăng nhập sai: đối chiếu file ADMIN_ACCESS của đúng bộ bàn giao; không dùng mật khẩu DB/MySQL/MQTT hay tài khoản cũ trên laptop Hợp. Sau khi nhập tài khoản mới có thể cần xóa cookie phiên cũ hoặc mở cửa sổ riêng tư.

Không bắt buộc dùng máy bạn: Thủy có thể mở cùng URL và đăng nhập quản trị thay bạn khi demo ít máy.
