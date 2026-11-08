# Luồng sản phẩm Smart Door — 06/11/2026

Cập nhật 08/11/2026: cấp phát bằng CLI kỹ thuật, admin không có đăng ký chip/QR. Firmware cơ sở **1.14.0** hỗ trợ OTA, chủ cửa tự xác nhận nhận bản do admin phát hành. Xem [hướng dẫn demo OTA và cấp phát hiện tại](DEMO_CAP_NHAT_FIRMWARE_TU_XA.md).

Đây là luồng mới theo yêu cầu người dùng, thay cho các hướng dẫn demo trước đây bắt người mua nhập hoặc đổi địa chỉ backend.

## Bên sản xuất chuẩn bị trước khi giao

1. Nạp firmware đúng phần cứng ESP32-S3.
2. Kỹ thuật viên dùng `scripts/register_local_device.py` đăng ký đúng MAC, tạo mã sản phẩm và mã nhận cửa dùng một lần. Mỗi sản phẩm có mạng thiết lập `SmartDoor-xxxxxx` và mật khẩu riêng.
3. File cấp phát chứa mã sản phẩm, mã nhận cửa, SSID/mật khẩu mạng thiết lập và khóa xác thực riêng. Công cụ sản xuất ghi file này vào bộ nhớ chip. Địa chỉ dịch vụ/broker và chứng chỉ cần thiết do bên triển khai cấu hình sẵn; không yêu cầu người mua nhập.
4. In QR dán sản phẩm. Chip cũng dựng QR trên TFT từ thông tin đã nạp, không cần Internet để hiển thị. QR có mã nhận cửa và thông tin mạng thiết lập, không có khóa xác thực thiết bị hoặc địa chỉ máy chủ tùy ý.
5. Không ghi trước Wi-Fi nhà của người mua và không nhận cửa vào tài khoản thử trước khi giao.

## Người mua thiết lập

1. Cấp nguồn: cửa phát Wi-Fi riêng `SmartDoor-xxxxxx`, hiển thị QR, tên mạng và mật khẩu trên màn hình.
2. Quét QR bằng Smart Door. App có sẵn địa chỉ dịch vụ; người mua chỉ đăng nhập tài khoản, không nhập IP/backend/broker.
3. Vào Wi-Fi điện thoại, kết nối mạng thiết lập của cửa. Nếu điện thoại cảnh báo không có Internet, giữ kết nối để cấu hình cửa.
4. Mở trang thiết lập tự hiện hoặc `http://192.168.4.1`. Trang này nằm trên chính ESP32, dùng được khi chưa có Internet.
5. Bấm tìm Wi-Fi. ESP32 quét các mạng xung quanh, người mua chọn Wi-Fi trong nhà và nhập mật khẩu. Mạng mở có thể để trống mật khẩu; mạng ẩn có ô nhập tên thủ công. Chỉ lưu khi kết nối thành công.
6. Trang này chỉ chọn/kết nối Wi-Fi, không tạo PIN. Bấm Hoàn tất và chờ báo Đã lưu Wi-Fi; nhấn rồi thả RST/EN hoặc rút nguồn 5 giây rồi cấp lại, chờ cửa kết nối lại. Không giữ BOOT hoặc khôi phục mặc định.
7. Đưa điện thoại về mạng có Internet. App dừng ở hướng dẫn khởi động lại, người dùng xác nhận đã thực hiện rồi kiểm tra lại cửa kết nối dịch vụ. Backend từ chối nhận cửa khi chưa có heartbeat online; chưa thể đặt tên/nhận cửa hoặc gửi PIN trước bước này.
8. Đặt tên và nhận cửa bằng QR trong app. Nhập PIN mở cửa và PIN quản trị (mỗi PIN 6 số, khác nhau, có xác nhận) trong app; chỉ có hiệu lực khi ESP32 ACK. PIN quản trị dùng cho quản lý/đổi mạng cục bộ, không phải mã nhận QR. Không tạo PIN trên portal hoặc màn hình chip.
9. Sau ACK, màn hình cửa tự bắt đầu hiệu chỉnh: giữ/nhấc từng dấu cộng 1–3, chạm giữa màn hình và xác nhận cửa đóng/mở. Đăng ký mới dùng góc servo mặc định, không yêu cầu trang chỉnh góc; khi cần chỉnh cơ khí, dùng Cài đặt thiết bị → Góc Servo sau khi đăng ký. Cửa mới chỉ ACTIVE sau khi PIN và các bước kiểm tra được xác nhận; mất mạng sau khi đã hoàn tất không chặn PIN/thẻ/vân tay cục bộ. Có thể tiếp tục từ Cài đặt thiết bị nếu đóng app giữa chừng.

Trình duyệt là bước cấu hình Wi-Fi cục bộ; app là nơi nhận cửa, tạo/đổi PIN và theo dõi hiệu chỉnh. Firmware connected 1.4.0 không cho đi tắt qua bước tạo PIN trên chip/web. Khi cập nhật từ bản cũ, chủ cửa đặt PIN trong app một lần để chuyển sang luồng này; các PIN cũ không tự hoàn tất bước mới.

## Quy tắc mạng và bảo mật

- Trang thiết lập chỉ phục vụ trên giao diện Wi-Fi riêng của cửa, không công khai trên LAN nhà. Mật khẩu Wi-Fi nhà không nằm trong QR hoặc phản hồi trạng thái.
- Mỗi phiên cấu hình Wi-Fi có CSRF token. Cửa đã nhận yêu cầu PIN admin trên màn hình để vào ADMIN → WI-FI; portal còn yêu cầu nhập lại PIN cho từng lần đổi mạng, kể cả khi mở từ app. Mạng thiết lập ban đầu trước khi nhận cửa chưa có PIN nên không yêu cầu bước này. Thử sai nhiều lần bị giới hạn thời gian.
- QR không được phép thay địa chỉ dịch vụ của ứng dụng; tránh QR lạ chuyển thông tin đăng nhập sang máy khác.
- MAC/UID định danh sản phẩm khác với mã nhận cửa ngẫu nhiên. Mã nhận cửa dùng một lần; mã cũ hết hiệu lực sau khi nhận hoặc làm lại sản phẩm.
- ESP32 giữ tối đa 5 mạng Wi-Fi; mỗi mạng mới chỉ được ghi sau khi kết nối thành công. Khi mất kết nối, chip lần lượt thử các mạng đã lưu mỗi 20 giây và mở AP phục hồi sau khoảng 30 giây. Điện thoại thường tự mở trang captive portal khi vào SmartDoor; có thể truy cập `192.168.4.1` nếu hệ điều hành không bật trang. Chọn hoàn tất sẽ tắt điểm phát. Thử mạng mới thất bại sau 35 giây sẽ giữ danh sách cũ rồi thử lại, không xóa PIN/quyền.
- ESP32-S3 dùng Wi-Fi 2.4 GHz. Nhận diện khuôn mặt và mở từ xa vẫn cần dịch vụ online; PIN/thẻ/vân tay đã cấp phép hoạt động cục bộ sau khi kích hoạt.

## Trạng thái hạ tầng hiện tại

HX-543 phía trong nhà được tích hợp từ firmware 1.11.0: dùng PIN mở cửa đã đặt trong app, `*` xóa, `#` xác nhận ở HOME. Dùng chung xác thực, giới hạn sai PIN, cấu hình bật/tắt PIN và chu kỳ tự khóa của TFT; không cấp quyền quản trị hay bỏ qua tạm khóa/tạm ngưng/thu hồi. Xem [hướng dẫn sử dụng](BAN_PHIM_TRONG_NHA.md).

Bản demo đã cấu hình sẵn dịch vụ tại máy phát triển qua Tailscale cho app và broker cùng LAN cho ESP32. Người mua không phải nhập các địa chỉ này. **Chưa có broker/VPS Internet**, nên chưa thể coi thiết bị dùng được ở một LAN bất kỳ ngoài địa điểm demo. Khi triển khai thật, bên vận hành phải cung cấp DNS/dịch vụ HTTPS và broker TLS truy cập được từ Internet, cấu hình chúng trước khi phát hành app/nạp sản phẩm. Không chuyển việc cấu hình hạ tầng này cho người mua.

## Cửa COM5 sau lần làm lại

MAC: `80:B5:4E:C8:14:9C`. Mã sản phẩm: `ESP32-80B54EC8149C`. Mạng thiết lập: `SmartDoor-C8149C`.

Đã xóa dữ liệu cửa cũ, giữ tài khoản; cảm biến vân tay xác nhận 0 mẫu, RC522 reset thành công, flash ESP32 đã xóa và nạp lại. Gói xuất xưởng mới cùng QR được lưu riêng trong `.local`, đã ghi vào chip. Không preset Wi-Fi người mua, chưa nhận cửa vào tài khoản.

File cấp phát chứa khóa riêng, chỉ dành cho phía sản xuất. Tem QR dùng để giao cho người mua: `.local/PRODUCT_QR_ESP32-80B54EC8149C.png`. Khóa riêng không nằm trong tem này.
