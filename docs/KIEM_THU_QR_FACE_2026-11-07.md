# Sửa quét QR Android và tải ảnh khuôn mặt · 07/11/2026

## Quét QR trên ESP32

Expo Camera Android trả `data` là giá trị hiển thị do bộ quét định dạng. Với QR Wi-Fi, giá trị này có thể chỉ chứa tên mạng/mật khẩu và thiếu trường mã nhận cửa. Payload nguyên bản nằm trong `raw`. Wizard trước đây đọc riêng `data`, nên báo mã kích hoạt không hợp lệ dù QR còn hiệu lực.

Wizard hiện ưu tiên `raw`; iOS/web không có trường này thì dùng `data`. Parser vẫn kiểm tra đầy đủ mã, UID và Wi-Fi, không bỏ qua xác thực hay tự thay đổi máy chủ API. Có kiểm thử mô phỏng sự khác nhau giữa Wi-Fi display value và raw QR, cũng như dữ liệu gốc không hợp lệ.

Trong lúc kiểm tra trên hệ thống thật, `ESP32-80B54EC8149C` chuyển từ `INVENTORY` sang `CLAIMED`, generation 2, unit 2 (`SD-000002`). INFO xác nhận chip đã nhận cửa, online và đang chờ `PINS`. Mã kích hoạt cũ đã được sử dụng nên không còn dùng để nhận cửa lần hai; tiếp tục cài đặt tại cửa vừa thêm. Không reset hoặc cấp mã thay thế trong lượt sửa này.

## Tải ảnh từ thư viện và lỗi 422

Đường cũ tải nguyên ảnh từ thư viện, bao gồm ảnh độ phân giải lớn. Bộ xử lý có giới hạn 20 megapixel và yêu cầu chất lượng mặt. Đồng thời, cả processor và service thay mọi lý do từ chối bằng một thông báo chung; phản hồi HTTP mặc định của Spring tiếp tục bỏ mất lý do, khiến app chỉ hiện lỗi 422.

Thay đổi:

- Ảnh thư viện được giải mã và lưu thành JPEG mới, cạnh tối đa 1600 px, trước khi gửi. Bỏ tham chiếu web File, MIME và EXIF cũ để multipart dùng đúng ảnh đã xử lý. Tệp nguồn tối đa 20 MiB; ảnh gửi máy chủ vẫn chịu giới hạn 5 MiB. Video giữ đường xử lý riêng, tối đa 10 giây/20 MiB.
- Processor trả mã từ chối có kiểm soát: không tìm thấy mặt, nhiều mặt, mặt quá nhỏ, mờ, bị cắt hoặc ảnh/video không đọc được. Backend chỉ ánh xạ các mã được biết sang lời hướng dẫn và trả JSON có `message` cho app.
- Log chỉ ghi mã lý do, loại tệp và dung lượng; không ghi ảnh, embedding, đường dẫn, tên tệp hay token. Thông báo lỗi nội bộ không được chuyển thẳng sang người dùng.

Ngưỡng chất lượng, xác minh người thật và quyền mở cửa giữ nguyên. Chưa có ảnh gốc người dùng đã chọn để kết luận lý do cụ thể ảnh đó bị từ chối; sau sửa, app có thể chỉ rõ lý do thay vì chỉ hiện số 422.

API tối ưu ảnh dùng [Expo ImageManipulator SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/imagemanipulator/), có trong Expo Go. Không cần build APK hoặc nạp lại chip cho hai sửa đổi này.

## Kiểm chứng

- Mobile: 61/61 test đạt, typecheck đạt, lint 0 lỗi/12 cảnh báo có sẵn. Android bundle từ Metro chứa sửa QR và chuẩn hóa ảnh.
- Python: 27/27 test đạt, gồm phản hồi lỗi chi tiết, không lộ dữ liệu nội bộ, xử lý khóa sau lỗi và kiểm tra xác thực processor.
- Backend: 22 test liên quan đạt; `mvn package` thành công. Kiểm tra HTTP của controller xác nhận lỗi 422 có trường `message`.
- Đã khởi động lại backend 8080 và processor 8091. Backend báo `READY`.
- Model thật nhận ảnh mẫu công khai `skimage/data/astronaut.png`, trả HTTP 200 và vector 512 chiều. Chỉ gọi endpoint trích xuất; không đăng ký ảnh mẫu vào tài khoản hoặc cấp quyền cửa.
- Tải ảnh trắng tổng hợp qua backend thật trả HTTP 422 kèm thông báo không tìm thấy khuôn mặt. Không tạo mẫu khuôn mặt cho lần từ chối này.

Log ở `.local/qr-face-mobile-tests.log`, `.local/qr-face-mobile-lint.log`, `.local/qr-face-python-tests.log`, `.local/qr-face-backend-package.log`, `.local/qr-face-fix-backend.out.log`, `.local/qr-face-fix-face.out.log`.

## Thử lại

Mở lại/reload dự án trong Expo Go và đăng nhập lại sau khi backend được khởi động lại. Tiếp tục đặt PIN tại cửa đã nhận. Để thử ảnh, vào **Khuôn mặt của tôi**, chọn ảnh rõ một người, thấy toàn bộ mặt và đồng ý tải lên. Nếu bị từ chối, làm theo lý do cụ thể app hiển thị. Đăng ký mẫu chưa tự cấp quyền mở cửa; vẫn cần duyệt/quyền tại cửa.
