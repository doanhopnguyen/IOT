# Smart Access Control IoT — Backend

Backend Spring Boot, Maven, Spring Data JPA, MySQL, Flyway và Lombok, package gốc `com.smartaccess`.
Đã triển khai tầng database và một phần Manager API theo schema hiện có. Chi tiết API, giới hạn invitation/cấp quyền và bộ Postman: [docs/manager-api.md](docs/manager-api.md). Authentication/JWT và giao tiếp thiết bị dành cho bước tiếp theo.

## Khởi chạy

Yêu cầu JDK 17+, Maven 3.6.3+ và MySQL 8.0.16+ để enforce CHECK constraint.
Maven đã cấu hình annotation processor Lombok, bao gồm khi chạy bằng JDK 25.

Tạo database trước bằng `database/create_database.sql`, ví dụ trong MySQL client:

```sql
SOURCE D:/DEV/IOT/smart-access-control-backend/database/create_database.sql;
```

Sau đó đặt biến môi trường trong PowerShell:

```powershell
cd smart-access-control-backend
$env:DB_URL = 'jdbc:mysql://localhost:3306/smart_access?serverTimezone=Asia/Ho_Chi_Minh'
$env:DB_USERNAME = '<database-user>'
$env:DB_PASSWORD = '<database-password>'
mvn spring-boot:run
```

Spring Boot không tự đọc `.env`; `.env.example` liệt kê các biến cấu hình.
Profile mặc định là `dev`; `SPRING_PROFILES_ACTIVE=prod` yêu cầu `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`.
Flyway chạy trước JPA; Hibernate dùng `ddl-auto: validate`, `open-in-view: false`.
Flyway chỉ tạo bảng trong database đã tồn tại. Sau khi V1 được áp dụng, thay đổi schema cần migration mới.
Đã gỡ Starter Security để Manager API test bằng Postman khi chưa có Authentication. managerId tạm truyền từ request; Service kiểm tra quyền quản lý cửa.

## Migration và model

Migration: `src/main/resources/db/migration/V1__init_database.sql`.
Script tạo database riêng: `database/create_database.sql`.

| Bảng | Entity | Repository |
| --- | --- | --- |
| accounts | Account | AccountRepository |
| access_units | AccessUnit | AccessUnitRepository |
| devices | Device | DeviceRepository |
| user_access | UserAccess, khóa UserAccessId | UserAccessRepository |
| credentials | Credential | CredentialRepository |
| face_requests | FaceRequest | FaceRequestRepository |
| access_logs | AccessLog | AccessLogRepository |
| telemetry | Telemetry | TelemetryRepository |
| events | Event | EventRepository |
| commands | Command | CommandRepository |
| audit_logs | AuditLog | AuditLogRepository |

Entity trong `src/main/java/com/smartaccess/model`, repository trong `repository`.
Repository đều kế thừa `JpaRepository`; Account bổ sung tìm/kiểm tra email và phone, Device bổ sung tìm/kiểm tra device UID.

12 enum trong `model/enumtype`: `AccountStatus`, `DeviceType`, `DeviceLifecycleStatus`,
`CredentialType`, `CredentialStatus`, `FaceRequestType`, `FaceRequestStatus`, `AccessMethod`,
`AccessResult`, `EventSeverity`, `AlertStatus`, `CommandStatus`.
Tất cả enum được lưu bằng `EnumType.STRING` trên cột VARCHAR.

Quan hệ entity một chiều, `ManyToOne` dùng LAZY, không cascade xóa.
`UserAccess` dùng `EmbeddedId` và `MapsId`. `FaceRequest` map Account và AccessUnit riêng,
database enforce foreign key kép tới UserAccess.
Timestamp dùng `LocalDateTime` với `DATETIME(3)`; callback tự điền created/requested/received và cập nhật updated.
`occurred_at` phải được cung cấp từ dữ liệu nguồn. JSON dùng `Map<String, Object>` và `JdbcTypeCode(SqlTypes.JSON)`.
Face embedding dùng BLOB; fingerprint chỉ lưu device và vị trí template.
Entity dùng Getter/Setter/NoArgsConstructor, không dùng Data hay sinh toString/equals/hashCode chứa secret.
Chỉ UserAccessId có equals/hashCode theo hai giá trị khóa.

## Foreign key

| Cột nguồn | Bảng đích | ON DELETE |
| --- | --- | --- |
| access_units.manager_id | accounts.account_id | SET NULL |
| devices.unit_id | access_units.unit_id | SET NULL |
| user_access.account_id | accounts.account_id | RESTRICT |
| user_access.unit_id | access_units.unit_id | RESTRICT |
| credentials.account_id | accounts.account_id | RESTRICT |
| credentials.device_id | devices.device_id | RESTRICT |
| face_requests.(account_id, unit_id) | user_access.(account_id, unit_id) | RESTRICT |
| access_logs.unit_id | access_units.unit_id | RESTRICT |
| access_logs.source_device_id | devices.device_id | RESTRICT |
| access_logs.account_id | accounts.account_id | RESTRICT |
| access_logs.credential_id | credentials.credential_id | RESTRICT |
| telemetry.device_id | devices.device_id | RESTRICT |
| events.device_id | devices.device_id | RESTRICT |
| commands.device_id | devices.device_id | RESTRICT |
| commands.requested_by | accounts.account_id | RESTRICT |
| audit_logs.actor_id | accounts.account_id | SET NULL |

Khóa chính `user_access`: `(account_id, unit_id)`. Các bảng còn lại có BIGINT AUTO_INCREMENT.
CHECK của accounts yêu cầu email hoặc phone khác NULL; validation nghiệp vụ bổ sung sẽ thuộc bước service.

## Index

| Bảng | Index thông thường |
| --- | --- |
| access_units | (manager_id) |
| devices | (unit_id); (lifecycle_status, last_seen_at) |
| user_access | (unit_id) |
| credentials | (account_id, credential_type, status); (rfid_uid, status); (device_id, local_template_id, status) |
| face_requests | (unit_id, status); (account_id, requested_at) |
| access_logs | (unit_id, occurred_at); (account_id, occurred_at); (source_device_id, occurred_at) |
| telemetry | (device_id, occurred_at); (device_id, metric_name, occurred_at) |
| events | (device_id, occurred_at); (alert_status, severity, occurred_at) |
| commands | (device_id, requested_at); (requested_by, requested_at) |
| audit_logs | (actor_id, created_at) |

19 index khai báo tường minh; MySQL bổ sung index cần thiết cho foreign key khi chưa có index phù hợp.
7 UNIQUE: `accounts.email`, `accounts.phone`, `devices.device_uid`, `access_logs.access_uuid`,
`telemetry.message_uuid`, `events.event_uuid`, `commands.command_uuid`.

## Kiểm thử

```powershell
mvn clean test
```

Không cần database để biên dịch; test tích hợp được bỏ qua khi không có `SMART_ACCESS_DB_TEST_URL`.
Để chạy đầy đủ, dùng database MySQL riêng dành cho kiểm thử vì Flyway sẽ tạo schema trong database đó:

```powershell
$env:SMART_ACCESS_DB_TEST_URL = 'jdbc:mysql://localhost:3306/smart_access_test?serverTimezone=Asia/Ho_Chi_Minh'
$env:SMART_ACCESS_DB_TEST_USERNAME = '<test-user>'
$env:SMART_ACCESS_DB_TEST_PASSWORD = '<test-password>'
mvn clean test
```

`DatabaseIntegrationTest` khởi động Spring Boot với `ddl-auto=validate`, kiểm tra Flyway,
11 bảng, toàn bộ FK và delete rule, PK/FK kép, 7 UNIQUE, 19 index; ghi/đọc toàn bộ entity,
BLOB, JSON, enum và timestamp. Test cũng xác nhận không thể tạo FaceRequest khi chưa là User,
không thể xóa membership có history, và manager/actor được SET NULL khi Account bị xóa.
Dữ liệu test được rollback sau mỗi test; schema Flyway được giữ lại.

Kết quả kiểm chứng ngày 03/10/2026 trên MySQL 8.0.43 tạm tại máy phát triển:
Flyway V1 áp dụng thành công; Hibernate validate thành công; `mvn clean test` BUILD SUCCESS,
4 test chạy, 0 lỗi, 0 thất bại, 0 bỏ qua. Không áp dụng migration vào MySQL đang dùng tại cổng 3306.

## Quy tắc dành cho bước nghiệp vụ tiếp theo

Role được suy ra từ `is_admin`, manager của unit và user_access, không có role cố định trên Account.
Credential ACTIVE không trùng cần được enforce tại service; dữ liệu riêng theo FACE/RFID/FINGERPRINT cần validation.
PIN chung không có allow_pin theo User. Online/offline suy ra từ last_seen_at; heartbeat không ghi telemetry.
Không lưu plaintext password, PIN hay device secret trong bảng hoặc JSON audit.
Không lưu ảnh khuôn mặt gốc hay fingerprint template trong backend.
