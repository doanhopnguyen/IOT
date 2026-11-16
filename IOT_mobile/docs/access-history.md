# Rà soát lịch sử ra vào

## Vấn đề phát hiện

- API `/api/access-logs` đã có `method`, `result` và đủ trường cho chi tiết, nhưng màn hình chưa sử dụng thiết bị nguồn, chưa có chi tiết, bộ lọc phương thức/kết quả hay nút làm mới.
- `account == null` dùng cùng một nhãn cho mọi phương thức; `LOCKDOWN` chưa được dịch. Nhiều reasonCode cần được trim và xử lý riêng, không suy diễn thành sai PIN/thẻ.
- `new Date(occurredAt)` và bộ lọc theo timezone điện thoại có thể sai khi điện thoại không ở Việt Nam. Backend trả `LocalDateTime` không có offset; sự kiện offline hợp lệ được đổi từ epoch sang `Asia/Ho_Chi_Minh` trước khi lưu.
- Luồng cũ tăng trang trước khi request thành công; cần giữ trang cuối đã tải thành công để thử lại đúng trang khi lỗi và chặn bấm liên tục.

## Thay đổi

- Card gọn: người thực hiện, phương thức/cửa, thiết bị nếu khác tên cửa, giờ Việt Nam, kết quả và lý do ngắn. Thiếu tên thiết bị thì dùng ID thật từ API.
- Dùng `AppModal` hiện có để xem đầy đủ tên, thời gian, lý do, ID bản ghi/thiết bị/cửa. Không gọi endpoint chi tiết mới.
- Nhãn danh tính theo phương thức; chỉ dùng tên tài khoản khi Backend đã trả tên. PIN không có tài khoản không bị gán cho chủ cửa.
- Bộ lọc thời gian/phương thức/kết quả gửi trực tiếp tới Backend. Mỗi lựa chọn cửa/bộ lọc có danh sách riêng, bắt đầu trang 0, bỏ phản hồi cũ.
- Nút ↻ cạnh tiêu đề tải lại trang 0 và giữ bộ lọc. Request đang chạy chặn bấm trùng; lỗi có nút thử lại; lỗi trang sau giữ các bản ghi đã tải. Loại bỏ ID trùng khi các trang dịch chuyển vì có log mới.
- Hàm thời gian dùng chung đọc datetime không offset theo giờ Việt Nam; datetime có offset được đổi về Việt Nam. Khoảng 7/30 ngày gồm hôm nay và 6/29 ngày trước. Các trang cùng một lần tải giữ cùng mốc `from`; làm mới tính lại mốc này.
- Không tích hợp tự tải qua `subscribeUpdates()`: hiện socket chỉ phát tín hiệu `refresh` chung, không xác định cửa hay loại dữ liệu. Nút làm mới đáp ứng yêu cầu mà không reload do sự kiện không liên quan.
- Không đổi logic Backend, firmware, schema, xác thực hoặc phân quyền. Backend chỉ được thêm regression test cho phạm vi tài khoản, bộ lọc và phân trang trên H2.

## Kiểm tra

- `npm.cmd run typecheck`: đạt.
- `npm.cmd run lint`: 0 lỗi, 11 cảnh báo trong các tệp khác; ESLint riêng các tệp Mobile thay đổi không có cảnh báo.
- `npm.cmd test`: 113/113 đạt, gồm 16 test mới. Chạy riêng 16 test lịch sử với `TZ=America/New_York` cũng đạt.
- Kiểm thử Chrome headless tách biệt với fixture: đạt ở viewport CSS 320px và 1024px; kiểm tra nhãn, mở/đóng modal, lọc, phân trang, làm mới, lỗi/thử lại, danh sách trống, bấm liên tục, phản hồi cũ và đổi cửa. Harness dùng React Native Web thật; icon/native screen boundary được thay thế trong harness, không thay trong App.
- Expo Web: xuất thành công vào `dist/access-history` bằng `node node_modules/expo/bin/cli export --platform web --output-dir dist/access-history --max-workers 2`.
- Backend: 24/24 test đạt trong các lớp `ModuleServiceTest`, `ModuleControllerTest`, `DeviceCommandFlowTest`, gồm kiểm tra H2 mới về phân quyền, bộ lọc và phân trang. Lần chạy tăng dần gặp lỗi class build cũ; chạy lại `mvn.cmd -o clean ... test` đã đạt.

Lệnh test đầu tiên trong sandbox bị `spawn EPERM`; một số tiến trình Expo trong sandbox không tự kết thúc sau khi in kết quả. Chạy lại test/lint/export bên ngoài sandbox đã đạt với exit code 0. Chưa kiểm thử trên Android/iOS thật, MySQL thật hoặc thiết bị ESP32. Fixture chỉ tồn tại trong kiểm thử; màn hình sử dụng API thật.

## Tự kiểm tra trên App

Chạy Backend và App theo README hiện tại, đăng nhập và chọn cửa thật, sau đó mở **Lịch sử ra vào**.

| Tình huống | Kết quả cần thấy |
| --- | --- |
| RFID cho phép, tài khoản có tên | Đúng tên người, cửa, thiết bị và nhãn Cho phép |
| PIN không có account | Không xác định người nhập; không hiện tên chủ cửa |
| Vân tay bị từ chối | Vân tay chưa xác định nếu thiếu tài khoản; nhãn Từ chối |
| Mở từ xa | Đúng người yêu cầu nếu API có account; phương thức Mở từ xa |
| Kết quả ERROR | Nhãn Lỗi, lý do tương ứng như timeout hoặc gửi lệnh thất bại |
| `LOCAL_ACCESS_DENIED,LOCKDOWN` | Hiện cả từ chối tại cửa và cửa tạm khóa; không khẳng định sai PIN |
| Mã lý do mới/chưa dịch | Thông báo trung tính, không hiện nguyên payload |
| Nhấn bản ghi, đóng bằng ×/Back Android | Mở chi tiết đúng bản ghi, cuộn được, đóng về danh sách |
| Đổi từng bộ lọc và phối hợp chúng | Chỉ log phù hợp, request mới có trang 0; không lẫn bản ghi cũ |
| Xem thêm lịch sử | Thêm đúng trang kế tiếp; khi lỗi, Thử lại không bỏ qua trang |
| Nhấn ↻ nhiều lần | Một request đang chạy; về trang 0, giữ bộ lọc |
| Khoảng không có log | Hiện Chưa có lượt truy cập sau khi tải xong |
| Tắt kết nối Backend rồi Thử lại | Hiện lỗi rõ ràng; không nhầm với danh sách trống; khôi phục được |
| Điện thoại ở múi giờ khác, log quanh 00:00 Việt Nam | Giờ và ngày vẫn theo Việt Nam; Hôm nay lấy đúng ngày Việt Nam |
| ESP32 offline rồi đồng bộ | Log giữ thời điểm phát sinh nếu clock hợp lệ; clock sai/chưa đồng bộ hiện ghi chú dùng giờ máy chủ |
| Chủ cửa/thành viên/tài khoản khác | Giữ phạm vi Backend: chủ cửa thấy log cửa quản lý; thành viên thấy log gắn chính tài khoản; không thấy log cửa không liên quan |

Chỉ tạo kết quả bằng luồng xác thực/thiết bị thật trong môi trường thử nghiệm; không cần sửa database để kiểm tra giao diện. Thông báo Cho phép không khẳng định cánh cửa đã mở vật lý.

## Giới hạn

- API không trả timezone/offset. Docker hiện cấu hình `TZ=Asia/Ho_Chi_Minh`; các luồng dùng `LocalDateTime.now()` hoặc `ZoneId.systemDefault()` phụ thuộc cấu hình JVM khi chạy ngoài Docker. UI không thể khôi phục thời gian gốc cho dữ liệu đã lưu sai timezone hoặc thiết bị chưa có giờ hợp lệ.
- Khi có log mới trong lúc phân trang, phân trang offset vẫn có thể dịch chuyển; App loại ID trùng, người dùng làm mới để nhận danh sách mới nhất.
- Mã lý do chưa có bản dịch được mô tả trung tính. Không suy đoán danh tính hoặc nguyên nhân chi tiết mà Backend chưa cung cấp.

## Review diff ngày 16/11/2026

- Phát hiện một lỗi bố cục: loading khi tải trang tiếp theo được chèn phía trên toàn bộ danh sách, đẩy vị trí các card đang xem. Đã giữ loading toàn trang cho lần tải đầu/làm mới và chuyển loading phân trang vào nút Xem thêm; nút vẫn chặn bấm trùng.
- Không cần thay các helper đang dùng: `Filter` dùng cho ba nhóm lọc, `Detail` dùng chung cho các trường modal, `AccessHistoryFeed` quản lý request/trang đã tải thành công. Component con có key theo cửa giúp đóng chi tiết và bỏ state cửa cũ khi đổi cửa. Không thêm abstraction hoặc tái cấu trúc trong lượt review.
- Đã đối chiếu modal với `AppModal`/overlay hiện có, logic reset bộ lọc/trang, xử lý phản hồi cũ, nhãn danh tính/lý do và quy ước thời gian Backend. Không phát hiện lỗi khác cần sửa trong phạm vi diff lịch sử.
- `AccessLogController`, `AccessLogService`, DTO, xử lý sự kiện và cấu hình Security không có diff logic. Test H2 xác nhận chủ cửa/thành viên/tài khoản khác vẫn bị giới hạn theo phạm vi hiện có, kể cả khi truyền ID cửa khác hoặc không truyền ID cửa.
- `.expo/access-history-check.cjs` là harness tạm của lần kiểm thử trước, hiện không còn trên đĩa, không được Git track và được pattern `.expo/` bỏ qua. Không xóa thêm dữ liệu trong `.expo`. Harness review chạy trong thư mục TEMP riêng và tự dọn đúng thư mục đó.
- Phạm vi commit lịch sử gồm `AccessHistory.tsx`, `services/accessHistory.ts`, `services/api/accessLogService.ts`, `utils/vietnamTime.ts`, `tests/access-history.test.ts`, phần test lịch sử trong `DeviceCommandFlowTest.java` và tài liệu này. Diff `client.ts`/`auth-api.test.ts` thuộc sửa đăng nhập riêng; cấu hình máy chủ, `.env.local`, `.vscode`, SQL mẫu và các tệp cá nhân khác không thuộc thay đổi lịch sử.

Kết quả chạy lại trong lượt review:

- 24/24 test Mobile đạt: `access-history.test.ts`, `history-api.test.ts`, `auth-api.test.ts`.
- 16/16 test lịch sử đạt khi chạy với `TZ=America/New_York`.
- 24/24 test Backend đạt: `ModuleServiceTest`, `ModuleControllerTest`, `DeviceCommandFlowTest`.
- TypeScript đạt; Expo lint có 0 lỗi và 11 cảnh báo có sẵn ở các tệp khác.
- Chrome headless với fixture tách biệt ở 320px/1024px đạt: card không dịch khi tải thêm, chặn request trùng, modal mở/đóng, lọc, làm mới, lỗi/thử lại và danh sách trống. Icon/native screen boundary được thay trong harness. Không ghi dữ liệu vào Backend thật.
- `git diff --check` đạt. Không chạy lại Expo export hoặc build Android/iOS trong lượt review này; kết quả export ở mục trên thuộc lần triển khai trước.
