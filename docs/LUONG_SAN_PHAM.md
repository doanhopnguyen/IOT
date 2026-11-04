# Luồng sản phẩm Smart Door — 05/11/2026

Đây là luồng mới theo yêu cầu người dùng, thay cho các hướng dẫn demo trước đây bắt người mua nhập hoặc đổi địa chỉ backend.

## Bên sản xuất chuẩn bị trước khi giao

1. Nạp firmware đúng phần cứng ESP32-S3.
2. Admin đăng ký đúng MAC, tạo mã sản phẩm và mã nhận cửa dùng một lần. Mỗi sản phẩm có mạng thiết lập `SmartDoor-xxxxxx` và mật khẩu riêng.
3. File cấp phát chứa mã sản phẩm, mã nhận cửa, SSID/mật khẩu mạng thiết lập và khóa xác thực riêng. Công cụ sản xuất ghi file này vào bộ nhớ chip. Địa chỉ dịch vụ/broker và chứng chỉ cần thiết do bên triển khai cấu hình sẵn; không yêu cầu người mua nhập.
4. In QR dán sản phẩm. Chip cũng dựng QR trên TFT từ thông tin đã nạp, không cần Internet để hiển thị. QR có mã nhận cửa và thông tin mạng thiết lập, không có khóa xác thực thiết bị hoặc địa chỉ máy chủ tùy ý.
5. Không ghi trước Wi-Fi nhà của người mua và không nhận cửa vào tài khoản thử trước khi giao.

## Người mua thiết lập

1. Cấp nguồn: cửa phát Wi-Fi riêng `SmartDoor-xxxxxx`, hiển thị QR, tên mạng và mật khẩu trên màn hình.
2. Quét QR bằng Smart Door. App có sẵn địa chỉ dịch vụ; người mua chỉ đăng nhập tài khoản, không nhập IP/backend/broker.
3. Vào Wi-Fi điện thoại, kết nối mạng thiết lập của cửa. Nếu điện thoại cảnh báo không có Internet, giữ kết nối để cấu hình cửa.
4. Mở trang thiết lập tự hiện hoặc `http://192.168.4.1`. Trang này nằm trên chính ESP32, dùng được khi chưa có Internet.
5. Bấm tìm Wi-Fi. ESP32 quét các mạng xung quanh, người mua chọn Wi-Fi trong nhà và nhập mật khẩu. Mạng mở có thể để trống mật khẩu; mạng ẩn có ô nhập tên thủ công. Chỉ lưu khi kết nối thành công.
6. Có thể đặt PIN mở cửa và PIN quản trị cục bộ trên trang này; hiệu chỉnh cảm ứng/cảm biến trên TFT. Khi đã có PIN quản trị, thay đổi Wi-Fi/PIN cần PIN quản trị hiện tại.
7. Chọn hoàn tất Wi-Fi. Cửa tắt điểm phát thiết lập sau vài giây để điện thoại trở về mạng thông thường. Mở lại Smart Door, đặt tên và nhận cửa vào tài khoản bằng QR sản phẩm. Không đổi cấu hình dịch vụ trong app.
8. Cửa chỉ sẵn sàng sau khi đã nhận vào tài khoản và hoàn tất PIN/cảm biến cục bộ. PIN đặt trực tiếp tại sản phẩm được thiết bị báo trạng thái đã cấu hình, không gửi PIN gốc về dịch vụ.

Người mua cũng có thể cấu hình Wi-Fi bằng trình duyệt và đặt PIN trên sản phẩm trước, sau đó mở app để nhận quyền quản lý. App và trang thiết lập là hai lối vào cùng quá trình, không phải hai lần đăng ký sản phẩm.

## Quy tắc mạng và bảo mật

- Trang thiết lập chỉ phục vụ trên giao diện Wi-Fi riêng của cửa, không công khai trên LAN nhà. Mật khẩu Wi-Fi nhà không nằm trong QR hoặc phản hồi trạng thái.
- Mỗi phiên cấu hình có CSRF token; khi đã đặt PIN quản trị thì phải xác thực PIN trước khi đổi Wi-Fi/PIN. Thử sai nhiều lần bị giới hạn thời gian.
- QR không được phép thay địa chỉ dịch vụ của ứng dụng; tránh QR lạ chuyển thông tin đăng nhập sang máy khác.
- MAC/UID định danh sản phẩm khác với mã nhận cửa ngẫu nhiên. Mã nhận cửa dùng một lần; mã cũ hết hiệu lực sau khi nhận hoặc làm lại sản phẩm.
- Điểm phát tự tắt khi chọn hoàn tất; có thể mở lại tại màn hình quản trị cửa khi cần đổi Wi-Fi.
- ESP32-S3 dùng Wi-Fi 2.4 GHz. Nhận diện khuôn mặt và mở từ xa vẫn cần dịch vụ online; PIN/thẻ/vân tay đã cấp phép hoạt động cục bộ sau khi kích hoạt.

## Trạng thái hạ tầng hiện tại

Bản demo đã cấu hình sẵn dịch vụ tại máy phát triển qua Tailscale cho app và broker cùng LAN cho ESP32. Người mua không phải nhập các địa chỉ này. **Chưa có broker/VPS Internet**, nên chưa thể coi thiết bị dùng được ở một LAN bất kỳ ngoài địa điểm demo. Khi triển khai thật, bên vận hành phải cung cấp DNS/dịch vụ HTTPS và broker TLS truy cập được từ Internet, cấu hình chúng trước khi phát hành app/nạp sản phẩm. Không chuyển việc cấu hình hạ tầng này cho người mua.

## Cửa COM5 sau lần làm lại

MAC: `80:B5:4E:C8:14:9C`. Mã sản phẩm: `ESP32-80B54EC8149C`. Mạng thiết lập: `SmartDoor-C8149C`.

Đã xóa dữ liệu cửa cũ, giữ tài khoản; cảm biến vân tay xác nhận 0 mẫu, RC522 reset thành công, flash ESP32 đã xóa và nạp lại. Gói xuất xưởng mới cùng QR được lưu riêng trong `.local`, đã ghi vào chip. Không preset Wi-Fi người mua, chưa nhận cửa vào tài khoản.

File cấp phát chứa khóa riêng, chỉ dành cho phía sản xuất. Tem QR dùng để giao cho người mua: `.local/PRODUCT_QR_ESP32-80B54EC8149C.png`. Khóa riêng không nằm trong tem này.
