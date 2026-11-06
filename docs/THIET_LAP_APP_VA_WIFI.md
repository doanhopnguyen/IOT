# Thiết lập bằng app và phục hồi Wi-Fi — 06/11/2026

Áp dụng cho firmware connected **1.3.0** và backend/mobile cùng thay đổi này. Không áp dụng cho sketch legacy; sketch offline dùng phần hiệu chỉnh tại chip riêng.

1. Cấp nguồn: chip chỉ hiện QR, mạng SmartDoor và địa chỉ chọn Wi-Fi. Chưa bắt hiệu chỉnh hoặc nhập PIN.
2. App quét QR, hướng dẫn điện thoại vào Wi-Fi SmartDoor và mở `http://192.168.4.1`. Portal chỉ quét/chọn mạng 2.4 GHz, nhập mật khẩu mạng và hoàn tất. Không tạo PIN tại đây.
3. Điện thoại trở về mạng có Internet/Tailscale. App kiểm tra kết nối dịch vụ; chỉ sau khi thiết bị online mới cho đặt tên và nhận cửa. Wi-Fi kết nối mà chưa tới được broker/backend thì chưa đủ.
4. Trong app chủ cửa đặt PIN mở cửa và PIN quản trị: 6 số, khác nhau, nhập lại để xác nhận. Backend chỉ lưu hash vào dữ liệu lệnh; PIN rõ chỉ nằm trong bản tin gửi tới đúng chip, không ghi log. Chỉ ACK thiết bị mới áp dụng hash vào hồ sơ cửa. Mạng demo MQTT plaintext chỉ dành cho LAN tin cậy; triển khai thực dùng TLS như tài liệu triển khai.
5. Chip tự chuyển sang TOUCH SETUP. App hướng dẫn giữ/nhấc ngón trên dấu cộng của **màn hình chip**, lần lượt 3 điểm và điểm giữa. Sau xác nhận, chip chuyển DOOR SETUP: xác nhận cửa đóng và cửa mở. Tiếp theo là SERVO LOCK và SERVO OPEN: chỉnh góc, bấm TEST, quan sát chốt thực tế rồi xác nhận từng vị trí. App cập nhật hướng dẫn, góc đã ra lệnh và chiều tăng/giảm theo heartbeat.
6. Cửa mới chỉ sẵn sàng sau PIN, cảm ứng, cảm biến cửa và hai vị trí servo đã xác nhận. Đổi số/đi vào bước hiệu chỉnh không tự xoay; chỉ nút TEST mới phát lệnh thử. TEST LOCK yêu cầu cánh cửa đóng, phải chờ hết xung thử trước khi xác nhận. Sau xác nhận OPEN, hệ thống giữ trạng thái vừa nhả chốt và dùng quy tắc tự khóa thông thường (đợi đóng ổn định, hoặc 5 giây nếu chưa mở cánh cửa). Không tự xoay lúc khởi động. Mặc định khóa 100°, mở 30°; góc đang lưu được giữ khi nâng firmware.

Nếu đóng app, vào cửa → Cài đặt thiết bị để tiếp tục. Có nút đổi PIN mở cửa/PIN quản trị và bắt đầu lại hiệu chỉnh. Hiệu chỉnh không yêu cầu tạo PIN lại. PIN quản trị chỉ dùng xác thực ADMIN trên chip/khôi phục Wi-Fi, không có màn hình tạo PIN trên chip.

## Đổi và khôi phục Wi-Fi

Thanh trên cùng của TFT luôn hiển thị 4 cột sóng, RSSI dBm hoặc WiFi OFF, kết nối dịch vụ và ONLINE/OFFLINE/SETUP. Màn hình PIN đã thiết lập vẫn hoạt động khi Wi-Fi/backend mất kết nối; AP phục hồi chạy nền và không tự che bàn phím bằng trang Wi-Fi. Nếu chủ động mở trang Wi-Fi thì nút BACK TO PIN / OFFLINE trở về bàn phím cả khi chưa có mạng.

Offline cho phép PIN, RFID/vân tay đã lưu và quản trị cục bộ; sự kiện được giữ để gửi bù. Khuôn mặt và mở từ app vẫn cần dịch vụ online. Nhận cửa/PIN app lần đầu vẫn cần online; sau khi PIN từ app đã xác nhận, các bước hiệu chỉnh cục bộ có thể tiếp tục nếu mạng tạm mất. Cửa đã sẵn sàng ở bản trước không bị bắt làm lại chỉ vì nâng lên 1.3.0.

- Online: chủ cửa chọn “Cho phép đổi Wi-Fi trong 10 phút” trong Cài đặt thiết bị. Chờ ACK, xem mạng/mật khẩu SmartDoor trên chip, nối điện thoại và mở portal chọn mạng mới.
- Offline: chip thử lại mạng đã lưu mỗi 15 giây và tự phát AP phục hồi sau khoảng 30 giây mất Wi-Fi. Chủ cửa có thể ADMIN → WI-FI trên chip bằng PIN đã đặt trong app. Nếu touch chưa được hiệu chỉnh, portal có bước xác thực **PIN quản trị hiện tại** để cho phép đổi Wi-Fi trong 10 phút. Không tạo/đổi PIN tại portal.
- Mạng mới sai mật khẩu/không kết nối được trong 35 giây: khôi phục biến kết nối từ cấu hình mạng cũ đã lưu. Chỉ lưu mạng mới khi kết nối thành công. Không xóa quyền, PIN, mẫu vân tay hay danh tính hãng khi đổi mạng.
- AP chỉ phục vụ HTTP trên giao diện SmartDoor, không phục vụ portal trên LAN nhà. Các POST cần CSRF. Hết thời gian cho phép thì không nhận thay đổi mạng mới.
- ESP32 phải truy cập được broker đã cấp phát. Đổi sang Wi-Fi khác không tự đưa ESP32 vào Tailscale hoặc thay địa chỉ broker. Demo hiện dùng broker LAN 10.18.0.194:1884; triển khai khác LAN cần broker TLS truy cập được từ mạng mới.

## Chỉnh góc servo trong app (1.2.1)

Vào Cài đặt thiết bị → Góc servo. App đọc góc chip đang lưu; nhập trực tiếp số nguyên 5–175° hoặc dùng nút ±5° cho từng góc khóa/mở. Hai góc được phép bằng nhau, kể cả khi lưu và khởi động lại, để chỉnh qua vị trí giữa (ví dụ 105°/100° → 100°/100° → 95°/100°). Khi bằng nhau, hai lệnh dùng cùng một vị trí servo.

Chủ cửa cần online để gửi lưu góc. App chỉ báo lưu thành công sau ACK; nhịp cập nhật trạng thái không ghi đè góc đang nhập. “Lấy góc đang lưu từ cửa” nạp lại số đã được chip báo về. Ghi góc không làm servo xoay; góc áp dụng ở lệnh mở/khóa tiếp theo. Chip từ chối lưu khi chốt đang nhả hoặc đang bận thực hiện lệnh. SERVO SETUP trên chip cũng cho phép hai góc bằng nhau; góc bằng nhau được chấp nhận khi đọc NVS sau reboot.

Tại chip có ADMIN → SERVO SETUP → GUIDED LOCK / OPEN SETUP để xác nhận lại hai vị trí mà không làm lại touch. Bước đầu đóng cánh cửa, chỉnh LOCK bằng ±5°, bấm TEST LOCK POSITION, chờ xung kết thúc, quan sát chốt và CONFIRM LOCK. Sau đó chỉnh/thử OPEN và CONFIRM OPEN / FINISH. Hai góc chỉ được ghi thành cặp sau khi cả hai vị trí đã thử và người dùng xác nhận. Góc bằng nhau vẫn được cho phép. Có thể quay về bước LOCK để chỉnh lại; khi cấu hình trước đó đã hợp lệ, có thể hủy và giữ cấu hình cũ.

SG90 không có phản hồi góc: `servoCommandAngle` là góc đã phát lệnh PWM, không phải phép đo vị trí thực. `servoDirection` là INCREASE/DECREASE/HOLD/UNKNOWN theo lệnh trước; góc mở trừ góc khóa cũng hiển thị trên chip. Không tự suy diễn chiều kim đồng hồ vì phụ thuộc hướng lắp; người dùng xác nhận bằng quan sát cơ khí. Lần khởi động đầu chưa phát PWM thì góc lệnh trước là unknown.

## Hợp đồng tích hợp

### Khôi phục mặc định nhà sản xuất (1.3.1)

Trong app quản lý: chọn cửa → Cài đặt thiết bị → Khôi phục mặc định nhà sản xuất. Nhập **cả mật khẩu tài khoản quản lý đang đăng nhập và PIN admin 6 số của cửa**, nhập đúng UID rồi xác nhận xóa. Mật khẩu tài khoản hoặc PIN admin sai đều không phát lệnh reset. Thành viên thường không được reset. Cửa phải online; PIN admin phải được chip xác nhận từ bước đặt PIN trong app trước đó.

App hiển thị tiến trình và tự kiểm tra mỗi 3 giây. Chỉ khi chip xác minh xóa và backend dọn dữ liệu cửa mới báo hoàn tất. Giữ nguồn và mạng trong quá trình này; mất phản hồi không có nghĩa yêu cầu chưa được thực hiện. Có thể cập nhật trạng thái để kiểm tra lại. Nếu cảm biến vân tay hoặc bộ nhớ lỗi, hệ thống không báo đã xóa thành công.

Reset xóa PIN mở cửa/admin, danh sách thẻ, toàn bộ mẫu trong cảm biến vân tay, hiệu chỉnh cảm ứng/cảm biến/servo, Wi-Fi, dữ liệu sự kiện trên chip; backend xóa thành viên, quyền, lịch sử, telemetry, lệnh và hash PIN admin của cửa. Góc servo trở về mặc định khóa 100°/mở 30°, chưa hiệu chỉnh và không phát lệnh xoay. RC522 không lưu người dùng; reset thu hồi quyền thẻ tại cửa, không xóa nội dung của các thẻ vật lý bên ngoài.

Firmware giữ bản ghi tiến trình để tiếp tục nếu mất điện. Wi-Fi cũ chỉ được giữ tạm trong lúc chờ xác nhận reset để chip còn kết nối lại và gửi bằng chứng xóa; khi xác nhận được ghi nhận, chip xóa Wi-Fi và khởi động lại. Lần bật tiếp theo là mạng SmartDoor và bước chọn Wi-Fi ban đầu. Firmware và danh tính xuất xưởng (UID, khóa xác thực dịch vụ, cấu hình broker, khóa Wi-Fi thiết lập) được giữ để thiết bị còn hoạt động; tài khoản và dữ liệu các cửa khác được giữ.

QR nhận cửa cũ không có hiệu lực trở lại. Sau reset, trong cùng màn hình có mục **Cấp mã nhận cửa mới** (xác thực lại mật khẩu tài khoản), sau đó kết nối Wi-Fi và nhận cửa bằng mã mới, đặt lại hai PIN và hiệu chỉnh từ đầu. Email bàn giao là tùy chọn nếu muốn chuyển cửa sang người nhận khác.

API reset hiện có ở cả app và web admin đều yêu cầu `password`, `adminPin`, `confirmation`; không lưu hai thông tin xác thực vào payload lệnh, log hoặc URL. Web admin cũng phải biết PIN admin của đúng cửa.

| Endpoint/lệnh | Mục đích |
|---|---|
| POST `/api/activation/inspect` | Kiểm tra QR và online, không tiêu thụ mã nhận |
| POST `/api/activation/claim` | Chỉ nhận cửa khi có heartbeat online; tên cửa do app gửi |
| GET `/api/manager/units/{id}/setup` | Trạng thái online, PIN, cảm ứng/cảm biến và bước hướng dẫn |
| POST `.../setup/credentials` / `SETUP_CREDENTIALS` | Gửi hai PIN tới chip, chờ ACK |
| POST `.../setup/calibrate` / `SETUP_CALIBRATE` | Bắt đầu lại hiệu chỉnh mà không xóa PIN |
| POST `.../wifi-setup` / `WIFI_SETUP` | Chủ cửa cho phép đổi Wi-Fi trong 10 phút |
| GET / PUT `/api/manager/units/{id}/servo` / `SERVO_SET` | Đọc/lưu góc khóa và mở; có thể bằng nhau; chỉ chủ cửa |
| Heartbeat | `setupStage`, `hasDoorPin`, `adminPinSet`, `touchCalibrated`, `doorCalibrated`, `wifiSsid`; không chứa PIN/mật khẩu Wi-Fi |

Firmware gửi `lockAngle`/`openAngle`, `servoCalibrated`, `servoCommandAngle` và `servoDirection`; các bước mới là SERVO_LOCK/SERVO_OPEN. Không thay giá trị chưa biết bằng góc mặc định. Kết quả xác nhận được lưu trong NVS người dùng; reset xóa cờ này cùng cấu hình người mua.

Không cần migration SQL: dùng telemetry và cột hash quản trị thiết bị đã có. Dữ liệu cấp phát/QR không thay đổi khi nâng firmware; `appPins` trong NVS người dùng đánh dấu đã nhận PIN từ app. Khi chuyển từ firmware cũ, cần thực hiện bước PIN app một lần; lần đầu này yêu cầu hiệu chỉnh lại để đi đúng luồng. Khi reset nghiệp vụ, marker này cũng bị xóa cùng NVS người dùng.

Kiểm thử cần phân biệt: unit/integration H2, build firmware, browser với API/portal mô phỏng có thể xác minh hợp đồng; thao tác ngón tay/nam châm, điện thoại thật và mất Wi-Fi thực tế vẫn cần thử tại thiết bị.
