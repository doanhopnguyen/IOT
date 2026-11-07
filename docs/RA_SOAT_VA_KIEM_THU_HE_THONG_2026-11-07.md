# Rà soát mobile, admin và kiểm thử hệ thống — 07/11/2026

Đợt kiểm tra này thực hiện sau khi tích hợp bàn phím HX-543 và bước khởi động lại sau lưu Wi-Fi. Firmware bàn giao **1.11.0**, chip ESP32-S3 COM5, MAC `80:B5:4E:C8:14:9C`. Hướng dẫn sử dụng trạng thái sạch sau kiểm thử: [chạy lại với Tailscale](CHAY_LAI_SAU_RESET_TAILSCALE.md).

## Những chỗ đã sửa

| Vấn đề | Hành vi sau sửa |
|---|---|
| Cửa hoặc thành viên đang xem vẫn được giữ khi backend đã xóa/thu hồi | Đối chiếu lại lựa chọn với danh sách mới; bỏ dữ liệu đã mất quyền. Đóng điều khiển cửa khi cửa không còn trong danh sách. |
| Phản hồi danh sách cũ có thể đến sau lần làm mới mới hơn hoặc sau đăng xuất | Chỉ nhận kết quả của yêu cầu mới nhất và đúng tài khoản; xóa dữ liệu phiên cũ. Đợi xử lý đăng xuất xong trước khi cho đăng nhập lại. |
| API danh sách cửa chưa giải thích được trạng thái bị admin hạn chế | Bổ sung `lifecycleStatus` trong DTO cửa. Mobile hiển thị riêng bảo trì, tạm ngưng và thu hồi. Quyền điều khiển trong DTO khớp điều kiện sẵn sàng và chính sách backend. |
| Thành viên vẫn thấy có quyền mở trong lúc chủ cửa tạm khóa | DTO chặn nút mở từ xa của thành viên khi lockdown có hiệu lực; backend tiếp tục kiểm tra quyền ở từng lệnh. Chủ cửa vẫn mở được, quyền khóa cửa được giữ theo nghiệp vụ hiện có. |
| Cài đặt thiết bị không tự cập nhật khi admin thay đổi/reset | Làm mới trạng thái định kỳ, bỏ phản hồi cũ khi vừa có kết quả thao tác mới. |
| Có hai giao diện đổi PIN với cách theo dõi kết quả khác nhau | Dùng giao diện đổi hai PIN trong DeviceSetup, xác nhận PIN nhập lại và chờ ACK; bỏ giao diện trùng không chờ kết quả đến cuối. |
| Giao diện hiệu chỉnh có thể vừa hiển thị bước cảm ứng vừa báo hoàn tất khi telemetry cập nhật lệch nhịp | Thông báo hoàn tất phải khớp cùng quy tắc xác định bước với wizard. |
| Mobile chỉ lấy chuỗi mã mới sau reset, chưa theo dõi khóa lưu QR | Giữ `syncCommand`, chờ ACK; nếu chưa xác nhận thì giữ mã hiện tại và cho gửi lại qua `sync-code`. Không tự cấp mã khác để thử lại. |
| Xóa cửa khỏi danh sách có thể làm mất màn hình kết quả reset | Giữ riêng ngữ cảnh cài đặt/reset cho đến khi người dùng quay lại; người thực hiện reset vẫn lấy được biên nhận và cấp mã mới theo quyền backend. |
| Hộp thoại tạm khóa dùng Alert không hoạt động nhất quán trên web | Dùng ConfirmationProvider chung; đã thử trực tiếp trên mobile web. |
| Web admin dùng chung cảnh báo mở cục bộ cho MAINTENANCE và SUSPENDED | MAINTENANCE giải thích quyền cục bộ đã lưu có thể còn dùng; SUSPENDED giải thích khóa chặn mở khi nhận cấu hình tạm ngưng; thu hồi giải thích xóa quyền khi nhận lệnh. |
| Web admin vẫn cho bấm reset khi đang reset hoặc không đủ trạng thái kết nối | Hiển thị đang chờ xác nhận, hoặc vô hiệu nút khi lifecycle/kết nối chưa cho phép. Backend vẫn là nơi quyết định quyền. |
| Hủy xác nhận thu hồi làm đóng cả biểu mẫu trạng thái | Giữ biểu mẫu khi hủy, không gửi lệnh thay đổi. |
| Client khuôn mặt còn các API cũ gửi embedding trực tiếp, trái với backend hiện tại | Bỏ API không dùng; kiểm thử hợp đồng đúng: upload ảnh/video qua processor, rồi gửi yêu cầu sử dụng hồ sơ tại cửa. |
| Kiểm thử schema MySQL chưa liệt kê đủ hai FK của migration V5 | Bổ sung chính xác hai FK CASCADE của `event_related_accounts`, giữ kiểm tra schema nghiêm ngặt. |

Không thêm migration database cho đợt sửa này. Trường `lifecycleStatus` bổ sung vào phản hồi danh sách cửa; các trường cũ vẫn được giữ.

## Ý nghĩa các trạng thái

| Trạng thái backend | Hiển thị/nghiệp vụ |
|---|---|
| Inventory `INVENTORY` | Chưa có chủ; dùng mã nhận hiện tại để nhận cửa sau khi thiết bị online. |
| Inventory `CLAIMED` | Đã có chủ, chưa hoàn tất PIN/cảm ứng/cảm biến/servo; chưa cho mở từ xa. |
| Inventory `ACTIVE` và `setupReady=true` | Thiết lập đã hoàn tất; vẫn phải xét lifecycle, kết nối và quyền từng phương thức. |
| Inventory `RESETTING` | Chờ bằng chứng xóa từ thiết bị; không coi đã reset chỉ vì POST thành công. |
| Lifecycle `MAINTENANCE` | Không nhận lệnh từ xa; quyền cục bộ đã lưu có thể tiếp tục hoạt động. |
| Lifecycle `SUSPENDED` | Bị admin tạm ngưng; chip chặn mở khi nhận cấu hình hạn chế. Mất kết nối có thể làm chậm việc áp dụng trên chip. |
| Lifecycle `DECOMMISSIONED` | Thu hồi vĩnh viễn; không chuyển lại ACTIVE. Chip xóa quyền cục bộ khi nhận lệnh thu hồi. |
| Owner lockdown | Tạm khóa do chủ cửa, khác SUSPENDED của admin; giữ lệnh mở từ app và thẻ/vân tay của chủ cửa. |
| Command `PENDING`/`SENT` | Mới gửi/đang chờ, chưa báo thao tác đã áp dụng. |
| Command `ACKNOWLEDGED` | Thiết bị xác nhận lệnh; trạng thái cơ khí khóa/đóng vẫn lấy từ telemetry tương ứng. |
| Command `FAILED`/`TIMEOUT` | Hiển thị lỗi hoặc chưa xác nhận, cho kiểm tra và thử lại theo nghiệp vụ. |

## Kết quả kiểm thử

| Phạm vi | Kết quả |
|---|---|
| Backend Maven `verify`, gồm MySQL thật trên DB dev cô lập | **347 tests, 0 lỗi, 0 thất bại, 0 bỏ qua**; package thành công. Hai nhóm test MySQL tạo/xóa fixture riêng, không thay admin hiện có. |
| Mobile | **83/83 tests**; TypeScript đạt; lint **0 errors, 12 warnings**. |
| Face node | **27/27 tests**. |
| Script | **16/16 tests**. |
| Firmware | **14/14 bộ host test** đạt, gồm keypad, setup, reset, quyền hạn chế, servo, Wi-Fi/NVS và xóa credential; build/nạp connected thành công. |
| MQTT thật qua Tailscale | **5/5** ca: chặn anonymous, sai mật khẩu, giả topic và nghe lén thiết bị khác; ca đối chứng hợp lệ nhận được. |
| API + MySQL + MQTT + gateway thật | **15 nhóm luồng** đạt với hai bộ điều khiển mô phỏng; liệt kê bên dưới. |
| Trình duyệt Edge headless | **8 nhóm kiểm tra** đạt cho admin và mobile viewport 390×844; không có lỗi JavaScript trang. |
| Face processor thật | Backend chuyển ảnh PNG trắng đến dịch vụ 8091 và nhận **422**; ảnh không có mặt không tạo hồ sơ. Dịch vụ từ chối thiếu token. |
| Portal laptop AI | `/health` ở 8092 trả 200; API riêng yêu cầu local token. |

15 nhóm API/MQTT bao gồm: phân quyền admin; hai chủ cửa nhận hai thiết bị; PIN lỗi/ACK và điều kiện sẵn sàng; chặn truy cập chéo cửa/mã nhận đã dùng; đồng ý lời mời; quyền mở của thành viên; lockdown và mở lại; cấu hình thời gian/khóa/mở; đọc thẻ và ghi credential sau ACK; từ chối embedding do client tự gửi; xóa hồ sơ khách sau ACK; bảo trì/tạm ngưng/khôi phục ACTIVE; khóa tài khoản làm hết hiệu lực phiên; lịch sử/CSV/thống kê; reset có xác thực, chờ ACK, tăng generation và không ảnh hưởng cửa khác; cấp/gửi lại QR hiện tại và thu hồi vĩnh viễn. Các nội dung liên quan được gộp trong 15 nhóm kết quả, không phải 15 thao tác đơn lẻ.

Trình duyệt đã thao tác thật với backend cho các chuyển đổi trạng thái admin; hiển thị trạng thái đó trên mobile; đổi PIN chờ ACK; xác nhận lockdown; hủy thu hồi; reset và giữ biên nhận sau khi cửa bị gỡ; cấp mã mới chờ khóa lưu; admin khóa tài khoản làm mobile trở lại đăng nhập và xóa danh sách cũ.

## Phần cứng thật

| Thiết bị | Đã xác nhận |
|---|---|
| ESP32-S3 COM5 | Xóa flash, nạp firmware 1.11.0, đọc lại INFO thành công. |
| Cảm biến vân tay | UART xác thực được; xóa ACK `0x00`, kiểm tra lại ACK `0x00`, bộ nhớ **0 mẫu**; firmware chính báo `fingerReady=1`, `authenticated=1`. |
| RC522 | Reset và phản hồi thanh ghi phiên bản **0x92**. |
| Webcam | Mở camera 0, đọc khung hình **640×480** thành công rồi đóng. Không lưu ảnh. |
| HX-543/TFT/reed/servo | Firmware tích hợp build được, kiểm thử logic host đạt. Bàn phím đã được người dùng xác nhận chạy đúng trước đợt này; không yêu cầu người dùng nhập/quét/chạm lại trong đợt tự động. |

Các ACK thẻ/vân tay, trạng thái sẵn sàng và reset trong phần API/MQTT là **mô phỏng**, không phải thao tác sinh trắc học/cơ khí thật. Đợt này không kiểm chứng người thật nhận diện đúng, chạm cảm ứng, đổi trạng thái nam châm, chuyển động chốt hay toàn bộ UI trên điện thoại Expo Go thật. Theo phạm vi yêu cầu, những phần cần tương tác vật lý chỉ xác nhận thiết bị phản hồi ở mức nêu trên. Backend/unit test kiểm tra thêm các nhánh duyệt hồ sơ mặt, từ chối, thu hồi và lỗi xử lý; không coi đó là kết quả nhận diện người thật.

Tailscale được thử từ máy chủ qua IP tailnet và qua gateway TCP trên chính máy. Chưa thử một điện thoại 4G hoặc gateway tại một đường Internet độc lập.

## Đã dọn sau kiểm thử

- Giữ **đúng một admin cũ**, không tạo lại và không đổi ID/hash mật khẩu.
- Các bảng nghiệp vụ đều 0 dòng; lịch sử Flyway được giữ.
- Registry MQTT rỗng, password file chỉ giữ tài khoản backend hạ tầng.
- Xóa factory/connection/QR thử, file tài khoản fixture riêng và ảnh chụp giao diện thử trong danh sách dọn. Các báo cáo kết quả kiểm thử được giữ, không chứa khóa thiết bị hay mật khẩu hoạt động.
- Cảm biến vân tay 0 mẫu; chip không còn danh tính cấp phát, Wi-Fi, PIN, thẻ hoặc cấu hình người dùng. INFO: `uid=` trống, `productPrepared=0`, `configBytes=0`, `savedWifi=0`, `claimed=0`, `appPins=0`, `cards=0`, `fingers=0`, `templates=0`, `storageFault=0`.
- Đóng cổng dự án 1884/1885/8080/8081/8091/8092; giữ MySQL, Tailscale và Mosquitto hệ thống 1883.

Log/kết quả máy kiểm thử nằm trong `.local/system-review-20261107/`; kết quả đối chiếu cuối ở `final-state.json`. Không commit `.local`.

## Bắt đầu sử dụng

Mở [hướng dẫn chạy từ đầu đến cuối với Tailscale](CHAY_LAI_SAU_RESET_TAILSCALE.md). Bắt đầu backend, đăng ký/cấp phát chip mới, bật broker và app, nhận cửa bằng tài khoản thường. Chờ portal báo lưu Wi-Fi xong rồi nhấn/thả RST/EN hoặc ngắt nguồn 5 giây trước khi lưu PIN lần đầu. Không chạy lại script xóa dữ liệu khi chỉ khởi động dự án hằng ngày.
