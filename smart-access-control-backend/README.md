# Smart Access Control IoT — Backend

Skeleton Spring Boot + Maven + MySQL, package gốc `com.smartaccess`.
Chỉ khởi tạo cấu trúc; chưa triển khai nghiệp vụ, API, Entity, Repository,
JWT, Authentication, migration hoặc giao tiếp ESP32/Edge PC.

## Yêu cầu

- JDK 17 trở lên; Spring Boot 3.5.16 hỗ trợ đến Java 25.
- Maven 3.6.3 trở lên.
- MySQL và database `smart_access` có sẵn nếu chạy ứng dụng.

Tham khảo: [Spring Boot system requirements](https://docs.spring.io/spring-boot/3.5/system-requirements.html).

## Biên dịch

```powershell
cd smart-access-control-backend
mvn clean compile
```

Biên dịch không yêu cầu MySQL đang chạy.

## Cấu hình môi trường và chạy

`.env.example` liệt kê biến môi trường cần dùng. Spring Boot không tự đọc `.env`;
hãy đặt biến trong terminal hoặc cấu hình môi trường chạy của IDE.
Ví dụ PowerShell (điền thông tin database của bạn trước khi chạy):

```powershell
$env:DB_URL = 'jdbc:mysql://localhost:3306/smart_access'
$env:DB_USERNAME = '<database-user>'
$env:DB_PASSWORD = '<database-password>'
$env:SPRING_PROFILES_ACTIVE = 'dev'
mvn spring-boot:run
```

Profile mặc định là `dev`. Dùng `SPRING_PROFILES_ACTIVE=prod` để chọn cấu hình
production; profile này yêu cầu cả `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`.
Mật khẩu không được lưu trong mã nguồn. `JWT_SECRET` chỉ dành cho bước triển khai
JWT sau này, hiện chưa được sử dụng.

Hibernate không tự tạo/sửa bảng (`ddl-auto: none`). Flyway tạm tắt vì chưa có
migration; bật lại khi bổ sung migration. Dependency `flyway-mysql` cung cấp
hỗ trợ MySQL cho Flyway. Starter Security vẫn dùng cấu hình mặc định của Spring
Boot; chưa có cấu hình xác thực riêng của dự án.

## Vai trò các package

| Package | Vai trò |
| --- | --- |
| `controller` | REST API Controller |
| `service` | Business logic |
| `repository` | Interface Spring Data JPA |
| `model` | Entity/JPA Model |
| `model/enumtype` | Enum của model |
| `dto/request` | Dữ liệu client gửi lên |
| `dto/response` | Dữ liệu trả về client; tránh trả trực tiếp Entity |
| `mapper` | Chuyển đổi Entity ↔ DTO |
| `config` | Cấu hình Spring Boot |
| `security/jwt` | JWT service/filter trong bước sau |
| `security/service` | Service phục vụ xác thực |
| `exception` | Exception và xử lý lỗi toàn hệ thống |
| `scheduler` | Tác vụ định kỳ |
| `util` | Tiện ích dùng chung, không chứa business logic |

`src/main/resources/db/migration` dành cho migration sau này.
`src/test/java/com/smartaccess` dành cho test sau này.
Các thư mục trống được giữ trong Git bằng `.gitkeep`.
