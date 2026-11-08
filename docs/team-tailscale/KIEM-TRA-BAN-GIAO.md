# Kiểm tra bàn giao 4 máy — 08/11/2026

## Phần cứng thực tế COM5

- MAC 80B54EC8149C / UID ESP32-80B54EC8149C.
- Đã xác thực cảm biến, xóa toàn bộ kho vân tay và nhận ACK templates=0.
- Đã erase toàn bộ flash ESP32, nạp lại firmware 2.0.5-demo rồi provision bộ danh tính/QR mới.
- INFO sau nạp: productPrepared=1, generation=1; savedWifi=0, claimed=0, configBytes=0, cards=0, fingers=0, templates=0, appPins=0.
- MotorEnabled=0, motorCommanded=0, lastServoAngle=-1000: chưa chạy servo; storageFault=0, motorFault=0.
- SetupStage=WIFI, UI=WIFI_SETUP: màn hình QR xuất xưởng và thông tin AP; chưa hiệu chỉnh cảm ứng/cảm biến, chưa có PIN và chủ cửa.
- Không nhận thiết bị trên backend cũ để thử; giữ nguyên trạng thái xuất xưởng cho nhóm.

## Kiểm thử phần mềm

- 21 bài kiểm thử scripts đạt, gồm TCP gateway, proxy admin/API, cookie phiên, CSRF, payload nhị phân và kiểm tra factory/SQL đồng nhất.
- 19 bộ native firmware đạt; bản demo upload thành công; helper xóa cảm biến build/upload thành công.
- SQL chạy trên MySQL với cấu trúc bảng thật trong nhóm bảng thử riêng: chạy seed hai lần vẫn chỉ một admin/thiết bị, BCrypt admin/secret đúng, claim_hash khớp QR, INVENTORY/gen1/setup_ready0 đúng; chặn seed khi thiết bị đã nhận. Bảng ứng dụng cũ không bị thay đổi; bảng thử đã được dọn.
- Bộ cấu hình server được sinh thử bằng installer. Mosquitto chạy thử loopback riêng: chặn anonymous/mật khẩu sai; cho chip gửi status và nhận cmd của mình; chặn ghi status và đọc cmd của UID khác. Broker thử đã dừng, không gửi lệnh cơ khí tới chip.
- PowerShell start-team.ps1 và team-firewall.ps1 đã kiểm tra cú pháp. Chưa thêm Firewall trên máy khác vì chưa có quyền truy cập các máy đó.
- Các server Java/MQTT/face-api/Expo cũ trên laptop Hợp đã dừng. Không xóa database cũ hoặc tài khoản cũ của laptop Hợp.

## Kết quả và giới hạn

SQL, QR, factory JSON và thông tin broker xuất phát từ cùng một bộ. Cường có thể nhập thiết bị từ xa mà không cần USB. Source, gói model và bốn gói riêng nằm trong `.local/team-handoff-20261108/`; log ở cùng thư mục. QR, mật khẩu và secret chỉ nằm trong gói riêng, không ghi ở hướng dẫn public.

Chưa chạy trực tiếp trên laptop Cường/Thủy/Bằng, chưa xác nhận Firewall/ACL Tailscale tại những máy đó hoặc điện thoại. Nhóm cần chạy các bước kiểm tra kết nối trong từng file hướng dẫn. Không tuyên bố toàn bộ hệ thống nhiều máy đã online trước khi các máy đó được khởi động.
