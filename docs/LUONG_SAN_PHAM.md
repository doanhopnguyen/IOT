# Luồng sản phẩm Smart Door — 06/11/2026

Cập nhật 11/11/2026: admin thêm thiết bị trước rồi nạp code từ web (xem mục dưới); CLI chỉ còn là đường dự phòng. Firmware cơ sở **1.14.0** hỗ trợ OTA, chủ cửa tự xác nhận nhận bản do admin phát hành. Xem [hướng dẫn demo OTA và cấp phát hiện tại](DEMO_CAP_NHAT_FIRMWARE_TU_XA.md).

Đây là luồng mới theo yêu cầu người dùng, thay cho các hướng dẫn demo trước đây bắt người mua nhập hoặc đổi địa chỉ backend.

## Bên sản xuất chuẩn bị trước khi giao

Cập nhật 11/11/2026: admin **thêm thiết bị trước**, rồi mới nạp code vào ESP32 ngay từ web admin. Không còn bước CLI, không còn tải file JSON chứa bí mật, không phải khởi động lại broker.

| Bước | Ai | Việc | Trạng thái kho |
|---|---|---|---|
| 1 | Admin (web) | **Thêm thiết bị**: chỉ nhập tên. Hệ thống tạo bản ghi với UID tạm `PENDING-…`, chưa có secret | `AWAITING_FLASH` — Chờ nạp code |
| 2 | Admin (web) | Cắm ESP32-S3 vào **máy chạy backend** → **Nạp code**: chọn cổng USB, chọn bản firmware có factory image, nhập lại mật khẩu | `AWAITING_FLASH` |
| 3 | Backend | Đọc MAC → gắn chip, UID thành `ESP32-<MAC>`, sinh secret/mã nhận cửa/mật khẩu mạng thiết lập/mật khẩu MQTT | `AWAITING_FLASH` |
| 4 | Backend | Tạo tài khoản MQTT riêng cho UID qua Mosquitto dynamic security (không restart broker) | — |
| 5 | Backend | Xoá flash, ghi factory image, gửi gói `FACTORY` qua serial, kiểm tra `INFO` khớp UID | — |
| 6 | Backend | Mở mã nhận cửa; web hiện QR để in và dán sản phẩm | `INVENTORY` — Chưa nhận cửa |

Quy tắc an toàn:
- Chỉ xoá flash khi MAC đọc được **chưa thuộc thiết bị khác**; không bao giờ xoá chip của cửa đã có chủ.
- Tài khoản broker được tạo trước khi xoá flash: broker lỗi thì chip còn nguyên.
- Mã nhận cửa chỉ có hiệu lực sau khi chip xác nhận `FACTORY_PROVISIONED`. Nạp lại sinh bộ bí mật mới, QR cũ hết hiệu lực.
- Thu hồi thiết bị (`DECOMMISSIONED`) khoá luôn tài khoản MQTT.
- Nạp từ web cần backend chạy **trực tiếp** trên máy cắm chip (`USB_ENABLED=true`, `USB_ESPTOOL_SCRIPT`, `PROVISION_MQTT_HOST`). Backend chạy trong Docker không thấy cổng COM: dùng đường CLI dự phòng (`scripts/register_local_device.py` rồi `scripts/device_tool.py provision`).
- Bản firmware dùng để nạp chip mới phải được phát hành kèm **factory image** (`scripts/build-firmware.ps1` sinh `.local/releases/factory-<phiên bản>.bin`).
- Không ghi trước Wi-Fi nhà của người mua và không nhận cửa vào tài khoản thử trước khi giao. QR không chứa khóa xác thực thiết bị hay địa chỉ máy chủ tùy ý.

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
