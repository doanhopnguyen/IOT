# Điều chỉnh nghiệp vụ sản phẩm — 05/11/2026

Tài liệu thiết kế theo trao đổi mới nhất. Luồng người mua Wi-Fi → app nhận cửa/PIN → hiệu chỉnh chip và quản lý/khôi phục Wi-Fi đã được triển khai đồng bộ trong firmware connected 1.2.0; xem [hướng dẫn hiện tại](THIET_LAP_APP_VA_WIFI.md). Các đề xuất sản xuất/Web Serial và phần khác trong tài liệu này không tự được coi là đã hoàn tất.

## 1. Tách sản xuất và vận hành

Backend có thể đặt trên máy chủ; web admin mở ở máy khác. Không dùng API backend để tìm COM của máy admin. Cổng COM là tài nguyên của máy đang cắm USB.

| Vai trò | Công việc |
| --- | --- |
| Bên sản xuất/kỹ thuật | Cắm chip tại máy kỹ thuật, đọc MAC, cấp phát danh tính, nạp firmware và dữ liệu riêng, kiểm tra, in QR |
| Admin hệ thống | Quản lý danh mục sản phẩm, tài khoản, trạng thái và reset theo quyền; không phải nạp lại mỗi lần bán/nhận cửa |
| Chủ cửa | Quét QR, kết nối Wi-Fi, nhận quyền sở hữu, đặt PIN và quản lý thành viên trên app |
| Thành viên | Dùng quyền được chủ cửa cấp; không được reset hoặc nhận quyền sở hữu |

Một người có thể vừa là admin vừa phụ trách sản xuất ở bản demo, nhưng hai nghiệp vụ cần nằm ở hai khu vực riêng.

## 2. Chuẩn bị sản phẩm trước khi bán

1. Máy kỹ thuật đọc MAC thực của chip qua USB tại chính máy đó.
2. Khu vực sản xuất đăng ký MAC với backend, nhận UID, thông tin cấp phát riêng và mã nhận ban đầu. MAC/UID là định danh công khai, không thay cho khóa xác thực hoặc mã nhận cửa.
3. Tải firmware đúng model/phiên bản và gói cấp phát của đúng thiết bị. Firmware chung có thể dùng cho nhiều chip cùng model; khóa xác thực phải riêng từng thiết bị. Không phát cho nhiều sản phẩm một file chứa cùng khóa/mã nhận.
4. Công cụ tại máy kỹ thuật kiểm tra chip khớp MAC, nạp firmware và dữ liệu cấp phát; đọc lại trạng thái xác nhận. Có thể đóng gói thành bộ cài riêng từng thiết bị, gồm manifest model, phiên bản, địa chỉ nạp, checksum, firmware và dữ liệu cấp phát. Gói có khóa riêng chỉ dành cho bên sản xuất.
5. Kiểm tra thiết bị kết nối đúng danh tính; đánh dấu đã cấp phát, in QR và bàn giao. Việc tạo bản ghi trên server chưa đủ để coi là đã nạp chip.

Hai cách nạp phù hợp:

- Công cụ cục bộ chạy trên máy kỹ thuật, sử dụng esptool và công cụ cấp phát hiện có. Đây là lựa chọn trước mắt cho dự án.
- Trang nạp dành cho kỹ thuật dùng Web Serial/esptool-js để truy cập USB của máy đang mở trình duyệt. Backend chỉ cấp gói, không đọc COM. Cần môi trường trình duyệt phù hợp và HTTPS hoặc localhost; người thao tác tự chọn cổng bằng hộp thoại trình duyệt.

Người mua nhận sản phẩm đã có firmware, danh tính và QR. Admin vận hành không cần tạo/nạp chip lại cho từng khách hàng.

## 3. Người mua thiết lập

1. Đăng nhập app, quét QR sản phẩm; app giữ thông tin để tiếp tục sau khi đổi Wi-Fi.
2. Cấp nguồn thiết bị mới: phát mạng SmartDoor riêng và hiển thị thông tin kết nối.
3. Điện thoại kết nối mạng SmartDoor, mở trang thiết lập trên ESP32.
4. Trang chỉ quét/chọn Wi-Fi 2.4 GHz, nhập mật khẩu và hiển thị kết quả. Không có bước tạo PIN mở cửa, thành viên hoặc quyền truy cập.
5. Xác nhận Wi-Fi kết nối thành công rồi hoàn tất, tắt AP. Kết nối Wi-Fi thành công không đồng nghĩa dịch vụ đã truy cập được: nếu dịch vụ chưa online, app báo chờ kết nối và cho phép thử lại. Thiết bị nên giữ khả năng vào lại chế độ thiết lập khi cần sửa Wi-Fi.
6. Điện thoại trở về mạng có Internet; app tiếp tục mã QR đã quét, kiểm tra thiết bị online và nhận cửa vào tài khoản. Chỉ một chủ cửa được nhận thành công; mã nhận dùng một lần.
7. Chủ cửa đặt tên cửa và PIN mở cửa trong app. Giao diện chỉ báo PIN có hiệu lực sau ACK từ thiết bị; không cho xem lại PIN cũ. PIN quản trị cục bộ, nếu giữ chức năng này, cũng cần một bước thiết lập riêng sau khi đã xác minh chủ cửa, không nằm ở trang Wi-Fi ban đầu.
8. App hướng dẫn hiệu chỉnh cảm ứng, cơ cấu khóa và cảm biến tại sản phẩm. Chưa đủ các điều kiện thì hiển thị thiết lập chưa hoàn tất, không coi cửa đã sẵn sàng.
9. Sau đó chủ cửa thêm thành viên, cấp thẻ/vân tay và duyệt yêu cầu khuôn mặt. Khuôn mặt chỉ sử dụng khi online như yêu cầu trước.

Việc đổi Wi-Fi của cửa đã kích hoạt vẫn cần chứng minh quyền quản trị và thao tác tại thiết bị; bỏ bước tạo PIN trên portal không có nghĩa bỏ xác thực khi thay đổi cấu hình sau này.

## 4. Reset về xuất xưởng

Chủ cửa thực hiện trên app; admin hệ thống thực hiện trên web. Thành viên không có quyền. Reset không cấp cho admin quyền xem PIN, mẫu vân tay hay quản lý quyền truy cập hằng ngày.

1. Hiển thị rõ dữ liệu sẽ xóa, xác thực lại mật khẩu và xác nhận đúng thiết bị.
2. Với reset từ xa, thiết bị phải online; không báo hoàn tất chỉ vì server nhận yêu cầu. Nếu không online, báo chưa thực hiện được. Khôi phục cục bộ khi mất mạng là luồng riêng cần cơ chế xác minh tại thiết bị và đồng bộ sau đó, không tự giải phóng quyền sở hữu trên server.
3. Chuyển sang đang reset, chặn mở cửa và cấp quyền mới; gửi lệnh gắn với thiết bị và thế hệ cấu hình hiện tại.
4. Xóa PIN, thẻ đã lưu trên cửa, mẫu vân tay trong cảm biến, thành viên, quyền khuôn mặt tại cửa, lịch sử và cấu hình người mua. Không xóa tài khoản hay hồ sơ khuôn mặt dùng chung ở các cửa khác. RC522 không lưu danh sách người dùng; reset không thể xóa mọi thẻ vật lý ở bên ngoài thiết bị.
5. Xác minh dữ liệu cục bộ/cảm biến đã xóa, xác nhận với server bằng giao thức có thể tiếp tục sau mất điện. Server thu hồi liên kết chủ cũ và mã/lệnh thế hệ cũ. Xóa Wi-Fi ở giai đoạn cuối để không làm mất đường xác nhận trước khi server biết kết quả.
6. Giữ firmware, UID/MAC, cấu hình dịch vụ của hãng và danh tính xác thực thiết bị. Reset nghiệp vụ không phải erase toàn bộ flash; xóa danh tính xuất xưởng sẽ buộc đưa lại về công cụ sản xuất.
7. Sau khi hoàn tất, phát lại Wi-Fi thiết lập và trở về trạng thái chưa có chủ. Lỗi xóa cảm biến hoặc chưa đủ xác nhận phải hiện chưa hoàn tất, cho phép thử lại.

Chuyển giao dùng cùng bước xóa sạch; sau đó cấp mã nhận mới cho người nhận hợp lệ. Không chuyển nguyên PIN/quyền/thành viên cũ sang chủ mới.

## 5. QR sau reset

Phân biệt mã sản phẩm ổn định và mã nhận cửa dùng một lần. Tem nhận cửa cũ không tự có hiệu lực trở lại sau reset; người từng chụp QR không được nhận lại cửa.

Với hệ thống hiện có, người thực hiện reset/người nhận được phép hoặc admin xác thực lại để lấy mã nhận mới sau khi reset đã hoàn tất. Có thể đưa mã mới vào app hoặc in QR bàn giao mới. Không bắt nạp lại firmware.

Nếu muốn tem QR cố định dùng suốt vòng đời, tem chỉ đóng vai trò định danh/hỗ trợ kết nối; nhận quyền sau reset phải có mã/challenge mới và bằng chứng tiếp cận thiết bị. Cơ chế này cần bổ sung, không chỉ cho phép dùng lại mã kích hoạt đã tiêu thụ.

## 6. Khoảng cách so với mã hiện tại

- Web hiện tìm USB trên máy backend: cần bỏ khỏi luồng admin vận hành, chuyển sang công cụ sản xuất cục bộ hoặc Web Serial.
- Đã có đăng ký danh tính và tải JSON cấp phát; chưa có bộ cài firmware kèm dữ liệu riêng được đóng gói/xác minh trong một thao tác.
- Web admin và app chủ cửa đã có reset/chuyển giao, xác thực lại và cấp mã mới sau reset. Cần rà soát khả năng hoàn tất qua mất điện/mất mạng và giao diện tiến trình; không cần tạo một nghiệp vụ reset trùng lặp.
- App đã có gửi yêu cầu đổi PIN. Cần đưa bước này vào quy trình sau nhận cửa, theo dõi ACK và giải quyết PIN quản trị cục bộ trước khi bỏ hoàn toàn bước cục bộ.
- Portal hiện vẫn có tạo PIN; cần giản lược giao diện và firmware đồng bộ, không chỉ ẩn ô nhập mà để trạng thái khởi động mắc ở bước PIN.
- Hạ tầng khác LAN vẫn cần dịch vụ HTTPS/broker TLS truy cập được; do bên triển khai chuẩn bị, không phải người mua nhập.

## Tham khảo kỹ thuật

- Espressif esptool-js (nạp từ trình duyệt qua Web Serial): https://github.com/espressif/esptool-js
- Espressif Factory NVS (danh tính thiết bị được giữ qua reset): https://docs.neo.rainmaker.espressif.com/docs/firmware/device-credentials/factory-nvs
