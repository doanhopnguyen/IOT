# Báo cáo sửa 4 chức năng Smart Door

Ngày kiểm tra: 16/11/2026. Áp dụng trên workspace hiện tại; giữ các thay đổi có sẵn chưa commit. Không commit, push, deploy, flash hoặc thao tác phần cứng thật. Không thay đổi schema database.

## 1. Nguyên nhân và kết quả

| Vấn đề | Nguyên nhân trong mã cũ | Thay đổi |
|---|---|---|
| Tình trạng module | Chưa có trang health; `rfidReady` chưa qua heartbeat; kết quả khởi tạo không chứng minh module còn phản hồi; telemetry lịch sử được giảm tần suất ghi nên không thích hợp làm snapshot hiện tại. | Thêm trang “Tình trạng thiết bị”, kiểm tra phản hồi AS608/RC522 định kỳ, snapshot whitelist từ đúng heartbeat mới nhất; phân biệt lifecycle và kết nối. |
| Hủy đăng ký | App chỉ chờ kết quả, chưa có MQTT cancel; modal cha có thể đóng riêng; RFID lưu thẻ sau polling mà chưa kiểm tra yêu cầu hủy. | Hủy có UUID cụ thể, chờ ACK thật, dùng chung logic đóng modal/Back; khóa thao tác lặp; kiểm tra phiên RFID trên backend trước khi gán. |
| Nhắc lại cảnh báo | Snapshot đầu ưu tiên OPEN/PIN; chỉ tải trang mới nhất; CRITICAL ACKNOWLEDGED bị bỏ qua; queue thông thường chưa loại RESOLVED. | Truy vấn tất cả trang cảnh báo nguy hiểm chưa giải quyết, kể cả ACKNOWLEDGED; deduplicate theo event ID trong phiên; loại cảnh báo đã giải quyết. |
| Thiết bị bị vô hiệu hóa | Danh sách chưa phân nhóm lifecycle; quyền mobile chỉ dựa vào kết nối/quyền từ xa; một số cấu hình ghi trực tiếp chưa có guard chung. | Stable partition đưa SUSPENDED/DECOMMISSIONED xuống cuối; nhãn riêng; chỉ đọc; kiểm tra lifecycle mới trước mutation; chặn lại trên backend và firmware. |

Heartbeat của thiết bị SUSPENDED vẫn được xác thực và nhận health, nhưng chỉ nhận cấu hình rút gọn. Kết nối không còn bị gán OFFLINE chỉ vì lifecycle không ACTIVE. Các lệnh điều khiển vẫn bị từ chối.

## 2. File của lần sửa này

Đường dẫn trong bảng được tính từ thư mục gốc tương ứng. Các file đang thay đổi từ trước như `application.yml`, `DeviceCommandFlowTest.java`, `AccessHistory.tsx`, `accessLogService.ts`, `.vscode/settings.json`, các tài liệu/dữ liệu mẫu có sẵn không được sửa bởi tác vụ này. Trong `client.ts`, chỉ thêm import và lời gọi guard lifecycle, giữ phần sửa mạng/CSRF có sẵn.

| Gốc | File mã nguồn |
|---|---|
| `IOT_mobile/` | `app/index.tsx` |
| `IOT_mobile/src/components/` | `CredentialEnrollment.tsx`, `DeviceHealth.tsx` (mới), `GlobalFaceRegistration.tsx`, `OwnerCredentials.tsx`, `OwnerDeviceSettings.tsx` |
| `IOT_mobile/src/hooks/` | `useEventNotifications.ts` |
| `IOT_mobile/src/services/api/` | `alertService.ts`, `client.ts`, `deviceState.ts`, `deviceHealth.ts` (mới), `lifecycleGuard.ts` (mới), `managerService.ts`, `rfidEnrollment.ts`, `unitService.ts` |
| `IOT_mobile/src/services/` | `notificationService.ts` |
| `IOT_mobile/src/utils/` | `permissions.ts` |
| `smart-access-control-backend/src/main/java/com/smartaccess/config/` | `DeviceLifecycleInterceptor.java` (mới) |
| `smart-access-control-backend/src/main/java/com/smartaccess/controller/` | `AlertController.java`, `DeviceHealthController.java` (mới), `EnrollmentController.java` (mới), `ManagerCommandController.java` |
| `smart-access-control-backend/src/main/java/com/smartaccess/dto/manager/` | `AssignRfidRequest.java`, `CommandResponse.java` |
| `smart-access-control-backend/src/main/java/com/smartaccess/service/` | `AlertService.java`, `CommandAckService.java`, `DeviceCommandService.java`, `DeviceHealthService.java` (mới), `EnrollmentService.java` (mới), `EdgeAiPairingService.java`, `FaceEnrollmentService.java`, `FingerprintService.java`, `ManagerAccessGuard.java`, `MqttDeviceGateway.java`, `RfidScanService.java`, `RfidService.java`, `TelemetryService.java`, `UnitService.java`, `UnitSettingsService.java` |
| `firmware/connected_door/` | `network.h` |

| Gốc | Regression test / fixture cập nhật |
|---|---|
| `IOT_mobile/tests/` | `alert-reminders-api.test.ts` (mới), `device-health-lifecycle.test.ts` (mới), `event-notifications.test.ts`, `rfid-enrollment.test.ts` |
| `IOT_mobile/tests/` | `factory-reset.test.ts`, `firmware-update.test.ts`, `lockdown.test.ts`, `member-credentials.test.ts`, `member-profile-input.test.ts`, `stats-dashboard.test.ts`: bổ sung response lifecycle ACTIVE cho bước preflight mới, giữ các assertion nghiệp vụ cũ. |
| `smart-access-control-backend/src/test/java/com/smartaccess/controller/` | `DeviceLifecycleInterceptorTest.java` (mới) |
| `smart-access-control-backend/src/test/java/com/smartaccess/service/` | `DeviceHealthServiceTest.java` (mới), `EnrollmentRegressionTest.java` (mới), `AlertStatisticsTest.java`, `MqttDeviceGatewayTest.java`, `TelemetryServiceTest.java`, `UnitServiceTest.java` |
| `firmware/tests/` | `test_enrollment_cancel.py` (mới) |

Script UI và ảnh kiểm tra nằm trong `.local/smart-door-browser-check.cjs`, `.local/smart-door-preview/`; đây là artifact kiểm tra cục bộ, dùng API giả lập.

## 3. API và MQTT

| Giao tiếp | Bổ sung / thay đổi |
|---|---|
| `GET /api/manager/units/{unitId}/health` | Chỉ chủ cửa; trả online, lastSeenAt, updatedAt và metric đã whitelist. Không trả Wi-Fi password, device secret hay credential. |
| `POST /api/manager/units/{unitId}/enrollments/{uuid}/cancel` | Chỉ chủ cửa và đúng thiết bị/phiên do tài khoản yêu cầu; trả command hủy hoặc kết quả đã hoàn tất. Gọi lặp khi đang chờ trả cùng command. |
| `GET /api/manager/units/{unitId}/users/{userId}/enrollments/current` | Khôi phục UUID gần đây khi response tạo phiên bị mất; giới hạn tài khoản, cửa và người đang đăng ký. |
| `GET /api/alerts/unresolved?page=0&size=100` | Phân trang, có kiểm tra quyền; lấy CRITICAL OPEN/ACKNOWLEDGED cùng cảnh báo PIN còn có thể xử lý. Không giới hạn khoảng ngày. Mobile tải hết các trang. |
| `POST .../users/{userId}/rfids` | Body bổ sung `scanCommandUuid`. HTTP assignment yêu cầu ACK đúng UUID, đúng người/cửa/UID, chưa yêu cầu hủy. Gán lại cùng phiên trả credential đã tạo, không tạo trùng. |
| Response command | Bổ sung `acknowledgedAt`. FAILED do lỗi gửi gateway không có ACK không được dùng làm bằng chứng phiên quét đã dừng. |
| MQTT `ENROLLMENT_CANCEL` | `data.targetCommandUuid`, `targetType`, `targetSequence`, cùng generation/TTL hiện có. |
| MQTT `FP_ENROLL` / `RFID_SCAN` | Thêm `enrollmentSeq` và `enrollmentExpiresAt`; firmware giới hạn thời gian quét bằng deadline gốc và TTL. |
| MQTT status / telemetry | Thêm `rfidReady`, `moduleHealthSupported`; giữ các metric hiện có. `wifiSsid` báo SSID kết nối thực tế. |

Health dùng snapshot trong bộ nhớ từ heartbeat đã xác thực, tách khỏi telemetry lịch sử có downsampling. Sau backend restart, chưa có snapshot thì hiển thị chưa xác định đến heartbeat kế tiếp. Heartbeat/snapshot quá 90 giây không được dùng để hiển thị module đang hoạt động. Firmware chỉ xác nhận khả năng phản hồi AS608/RC522 khi lần probe gần đây còn hợp lệ; firmware cũ không có `moduleHealthSupported` được hiển thị chưa hỗ trợ kiểm tra.

## 4. Bảo đảm hủy trên ESP32

- App đặt cờ yêu cầu hủy ngay, chặn gán RFID từ polling cũ và chặn thao tác lặp. Nút đóng, Back qua overlay và đóng modal cha cùng gọi logic hủy. Khi chờ ACK hiển thị “Đang hủy...”; timeout/lỗi hiển thị “Chưa xác nhận hủy”, giữ phiên để thử lại.
- ESP32 đối chiếu UUID. Với vân tay, hủy đưa `remoteStage` về 0 và xóa UUID đang chạy; với RFID, xóa `rfidScanUuid`. Vòng quét không tiếp tục xử lý phiên đó.
- Kết quả `ENROLLMENT_CANCELLED` chỉ được backend chấp nhận theo phản hồi thiết bị. Command gốc chuyển FAILED với mã này; success ACK trễ không tạo credential. Backend cũng từ chối RFID assignment sau khi đã yêu cầu hủy, kể cả ACK đọc thẻ đến trước ACK hủy.
- Nếu `storeModel()` đã thành công, firmware giữ bằng chứng hoàn tất và trả `ENROLLMENT_ALREADY_COMPLETED`. App chờ kết quả command gốc và báo đã hoàn tất trước khi hủy. Không dùng `deleteModel()` trong luồng hủy; không xóa mẫu cũ hoặc mẫu vừa hoàn tất.
- Durable sequence watermark ngăn command bắt đầu đến muộn sau cancel, kể cả khi ACK cache đã được xác nhận/xóa. Giữ generation và kiểm tra thêm generation của phiên trên backend.
- Phiên quét vẫn tự timeout khi mất mạng hoặc app bị đóng. Deadline bổ sung ngăn delivery trễ kéo phiên vượt quá giới hạn của command backend; kiểm tra lại deadline trước `storeModel()`.
- Khi không có bằng chứng về kết quả sau một lần khởi động lại quanh thời điểm lưu mẫu, trả `ENROLLMENT_OUTCOME_UNKNOWN`, không báo hủy thành công và không tự xóa template để đoán kết quả.
- SUSPENDED có thể gửi ACK cleanup của phiên đăng ký đã chạy; không dùng đường này để ACK các lệnh điều khiển khác. Firmware nhận suspension cũng thoát phiên quét.

## 5. Quy tắc nhắc lại cảnh báo

Tập `seen` tồn tại trong phiên app/đăng nhập, không reset khi polling, WebSocket refresh hay foreground/background. Popup chỉ tạm ẩn; không PATCH trạng thái backend. Phiên app mới hoặc đăng nhập mới tải lại các cảnh báo còn OPEN/ACKNOWLEDGED, kể cả cảnh báo đã đóng ở phiên trước. RESOLVED bị loại khỏi thông báo và queue. Queue deduplicate theo event ID, hiển thị lần lượt. Không thêm push notification hay kho lưu trữ mới.

Giữ nguyên SAFE/LOCKDOWN và yêu cầu ACK hợp lệ cho `REPEATED_WRONG_PIN`; không dùng ACKNOWLEDGED thay cho RESOLVED.

## 6. Khóa thao tác theo lifecycle

Danh sách Home/Devices dùng stable partition: thiết bị còn dùng được đứng trước, SUSPENDED/DECOMMISSIONED đứng cuối, giữ nguyên thứ tự trong mỗi nhóm và giữ các bộ lọc/tìm kiếm cũ. Không loại thiết bị khỏi danh sách khi tài khoản còn quyền xem.

SUSPENDED mang nhãn “Bị tạm ngưng”, DECOMMISSIONED mang nhãn “Đã thu hồi”. Màn hình cấu hình chuyển sang thông tin chỉ đọc; Back, đăng xuất và health vẫn dùng được. Màn hình thành viên/credential/duyệt khuôn mặt không cho thao tác trên cửa bị vô hiệu hóa. Quyền remote lock/unlock kiểm tra lifecycle ngay cả khi cờ quyền cũ còn true.

Mỗi mutation API theo cửa/thiết bị từ mobile đều đọc lifecycle hiện tại trước khi gửi. Backend có interceptor cho các mutation manager/activation, guard trong service cấu hình/RFID/khuôn mặt/camera và kiểm tra lại lúc dispatch command. Firmware từ chối lệnh khi đã nhận suspension/retirement; trang đổi Wi-Fi cục bộ cũng chặn ghi. Settings cập nhật mỗi 3 giây, danh sách mỗi 10 giây và qua realtime. Admin chuyển SUSPENDED về ACTIVE hợp lệ sẽ tự mở lại giao diện theo lần refresh tiếp theo; mobile không có API tự kích hoạt DECOMMISSIONED.

Hai cách thiết lập camera AI hiện có được giữ nguyên. Chỉ thêm lifecycle guard cho thao tác ghép/gỡ/cấu hình; không đổi mã ghép, UID/secret hoặc nghiệp vụ cấp camera.

## 7. Kết quả kiểm thử thực tế

| Kiểm tra | Kết quả |
|---|---|
| `npm.cmd run typecheck` trong `IOT_mobile` | Đạt. |
| `npm.cmd run lint` | Đạt: 0 error, còn 12 warning. Không tắt rule để che cảnh báo. |
| `npm.cmd run test` | 127/127 test đạt. |
| `mvn.cmd -q test` trong backend | 54 test suite; 433 test được phát hiện, 423 chạy đạt, 10 skipped; 0 failure, 0 error. |
| PlatformIO `run -c platformio.connected.ini -e esp32-s3-connected` | SUCCESS; tạo firmware build, không upload. |
| `test_enrollment_cancel.py` | Đạt: chạy trực tiếp các hàm production với ArduinoJson và ngoại vi mô phỏng; hủy trước quét/sau mẫu đầu/trước mẫu hai, race store, timeout offline, sai UUID, delayed start, lỗi storage, retry và đăng ký lại. |
| Các script firmware liên quan | `test_setup_flow.py`, `test_door_restriction.py`, `test_wifi_storage.py`, `test_member_removal.py`, `test_factory_reset.py`: đều đạt. |
| Chrome headless 320×640 | Đạt: layout/scroll health, sensor không phản hồi/chưa xác nhận, queue cảnh báo không lặp trong phiên và nhắc lại khi reload, chờ ACK hủy, chặn hủy lặp/đóng khi đang hủy, đăng ký lại và settings chỉ đọc khi suspension. Dùng API giả lập. |
| `git diff --check` | Đạt. |

Log nằm tại `.local/smart-door-mobile-tests.log`, `.local/smart-door-backend-tests.log`, `.local/smart-door-lint-verified.log`, `.local/smart-door-firmware.log`. Lần typecheck cuối và chạy trực tiếp ESLint `app src` sau các chỉnh sửa cuối cũng đạt, log ESLint: `.local/smart-door-lint-final-check.log`. Ảnh kiểm tra: `.local/smart-door-preview/health-320.png`, `cancelling-320.png`, `suspended-320.png`.

## 8. Giới hạn đã xác định

Chưa chạy trên Android/iOS thật, ESP32/AS608/RC522/servo/TFT/touch thật hoặc MQTT qua thiết bị thật. Test C++ dùng sensor/storage/transport mô phỏng và test UI dùng API giả lập; các kết quả đó không xác minh dây nối, UART/SPI, hành trình servo hay chất lượng lấy mẫu thật.

10 test tích hợp MySQL được bỏ qua vì không có biến `SMART_ACCESS_DB_TEST_URL`. Backend regression dùng H2 và mock theo từng test; chưa xác minh khóa đồng thời trên MySQL thật.

Servo/TFT/touch không có kiểm tra phản hồi vật lý đáng tin cậy nên hiển thị chưa hỗ trợ kiểm tra. Reed switch chỉ báo dữ liệu khi firmware đã xác nhận chu kỳ cảm biến; phần mềm không thể tự phân biệt mọi trường hợp dây cảm biến bị rút hoặc kẹt sau hiệu chỉnh. Việc gián đoạn nguồn đúng lúc ghi template có thể cần kiểm tra thiết bị để đối soát; luồng hủy giữ trạng thái chưa xác định và không tự xóa mẫu.

Firmware cũ chưa hỗ trợ `ENROLLMENT_CANCEL` sẽ không được báo hủy thành công giả; app giữ thông báo chưa xác nhận. Các API mới cần được triển khai cùng backend/mobile tương ứng trước khi sử dụng ngoài workspace.

## Bổ sung: lỗi khởi động MySQL ngày 16/11/2026

Log khởi động chỉ ra `devices.pairing_code_hash` có kiểu `CHAR(64)` theo migration V10, nhưng mapping `Device.java` mặc định yêu cầu `VARCHAR(64)`. Đã bổ sung `columnDefinition = "char(64)"` cho field này, giữ `ddl-auto: validate`; không sửa migration đã chạy hoặc database.

Bổ sung `DeviceSchemaValidationTest.java`: regression tái tạo cột CHAR(64) trên H2 và kiểm tra Hibernate validate. Test tùy chọn dùng `SMART_ACCESS_SCHEMA_CHECK_URL`, `SMART_ACCESS_SCHEMA_CHECK_USERNAME`, `SMART_ACCESS_SCHEMA_CHECK_PASSWORD` chỉ validate metadata trên MySQL hiện có bằng connection read-only; không chạy ứng dụng, scheduler hoặc Flyway.

Đã chạy `DeviceSchemaValidationTest` và `EdgeAiPairingTest`: 5/5 test đạt, bao gồm validate schema MySQL 8.0.43 thật. Log: `.local/pairing-schema-tests.log`. Đây là kiểm tra schema, không thay thế các test tích hợp MySQL nghiệp vụ/concurrency được ghi là skipped ở trên.

## Bổ sung: menu cài đặt chủ cửa theo ảnh tham chiếu

Ba cửa mẫu đang có controller trong `devices` nhưng thiếu dòng tương ứng trong `device_inventory`. Màn hình cũ chỉ dùng API activation nên không hiện đủ nhóm icon. `OwnerDeviceSettings.tsx` và `unitService.ts` đã được sửa để đọc thêm cửa có role OWNER từ `/api/units`, vẫn giữ thông tin cấp phát riêng; không tạo hồ sơ cấp phát hoặc giả lập trạng thái sẵn sàng.

Giữ hai nhóm “Vận hành & An ninh”, “Phần cứng & Hệ thống” với 4 cột trên điện thoại như ảnh. Thêm ô “Tình trạng cửa” dùng `pulse-outline` màu xanh ngọc, mở trang health hiện có. Nhãn hỗ trợ 3 dòng ở màn hình hẹp qua prop `titleLines` của `FeatureTile` trong `ui.tsx`. Đưa badge trạng thái xuống dưới tên để không bó hẹp tiêu đề thiết bị. Khôi phục gốc trên cửa thiếu hồ sơ cấp phát chỉ hiện thông báo, không gửi lệnh reset. SUSPENDED/DECOMMISSIONED tiếp tục ở chế độ chỉ đọc.

Thêm `IOT_mobile/tests/owner-settings.test.ts`; mobile hiện có 131/131 test đạt. TypeScript đạt, lint không có error (còn 12 warning). Đã kiểm tra menu, điều hướng health và bố cục tại 320/337/390 px bằng Chrome với API giả lập. Ảnh nằm trong `.local/smart-door-preview/owner-settings-320.png`, `owner-settings-337.png`, `owner-settings-390.png`; chưa xác minh lại trên điện thoại Android/iOS thật.

## Bổ sung 17/11/2026: nội dung riêng cho từng mục Phần cứng & Hệ thống

Nguyên nhân các icon mở cùng giao diện: `DeviceSetup` trả về wizard khi `setupPage !== COMPLETE`, trước khi xét `initialView`. Cửa mẫu chưa có PIN/hiệu chỉnh vì vậy luôn hiện “Tạo hai mã PIN” dù chọn Servo, Wi-Fi hay hiệu chỉnh. Wizard nay chỉ ưu tiên trong luồng thiết lập ban đầu; các trang cài đặt độc lập hiển thị đúng chức năng. Không sửa trạng thái sẵn sàng, hồ sơ cấp phát hoặc dữ liệu trong database.

Giữ bố cục nhóm icon, nền sáng và card bo góc hiện có. `HardwareSettingsUi.tsx` cung cấp phần giới thiệu có icon/màu riêng, ô tiến độ nhập PIN, sơ đồ cảm ứng và hướng dẫn đánh số. Nội dung từng mục:

- PIN mở cửa và PIN Admin: hai form riêng, mã 6 số được che, xác nhận riêng; giữ ACK trước khi báo thành công. Cửa chưa có đủ PIN ban đầu có nút mở wizard tạo cả hai mã.
- Servo: góc đang lưu, minh họa góc đã chọn, điều khiển ±5°, quay thử và lưu. Các nút thử chiếm cả hàng để đọc được trên màn hình 320 px. Giữ queue, ACK và giới hạn góc hiện có; chặn quay khi chưa hoàn tất thiết lập hoặc mất kết nối.
- Hiệu chỉnh: sơ đồ đúng firmware (3 điểm căn và điểm giữa xác nhận), tiến độ thao tác trên khóa, trạng thái cảm ứng/cảm biến riêng.
- Wi-Fi: mạng đã lưu, trạng thái kết nối, ba bước đổi mạng và các nút mở thiết lập/cài đặt điện thoại/trang chọn mạng.
- Camera AI: khối ghép laptop bằng tài khoản và mã cửa; khối riêng mở modal ghép camera do admin cấp. Giữ luồng cấp UID/secret và xác thực hiện có.
- Tạm khóa: trạng thái an ninh ở giữa, phạm vi quyền bị tạm dừng, nút bật/tắt qua xác nhận. Chỉ gọi API cần cho trang này; API thống kê lỗi không chặn trạng thái tạm khóa. Chưa tải được trạng thái hiển thị chưa xác định, chặn thao tác và cho thử tải lại.
- Khôi phục gốc: khối dữ liệu sẽ bị xóa; giữ mật khẩu/PIN Admin/xác nhận UID, xác nhận phá hủy và ACK. Thiếu inventory vẫn không có form gửi reset.
- Tình trạng cửa: từng module có icon riêng, phản hồi và thời điểm cập nhật. Giữ nguyên quy tắc dữ liệu cũ/chưa hỗ trợ/chưa xác nhận cảm biến.

Lifecycle vô hiệu hóa khi đang mở trang sẽ chuyển về phần giới thiệu đúng chức năng kèm thông báo chỉ đọc; không còn thay nội dung mọi trang bằng health.

Kiểm tra: 131/131 mobile test đạt; TypeScript đạt; ESLint 0 error, 12 warning có sẵn. `.local/hardware-pages-check.cjs` đã mở đủ 9 mục ở 320/390 px, kiểm tra cửa chưa thiết lập/đã sẵn sàng/ngoại tuyến/bị tạm ngưng, wizard ban đầu, form PIN độc lập, khóa thao tác Servo, modal camera, xác thực reset, lockdown tải độc lập và trạng thái lỗi. Không có mutation API trong bài kiểm tra này. Bộ `.local/smart-door-browser-check.cjs` cũng đạt lại các luồng menu, cảnh báo phiên app và hủy đăng ký chờ ACK. Log: `.local/hardware-browser-result.log`, `.local/hardware-regression-result.log`; ảnh: `.local/hardware-pages/`. Các kiểm tra UI dùng Chrome và API giả lập, chưa xác minh trên Android/iOS hay phần cứng thật.
