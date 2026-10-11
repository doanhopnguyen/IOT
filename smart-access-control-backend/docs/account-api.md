# API tài khoản

Phạm vi: đăng ký, đăng nhập bằng email hoặc số điện thoại, xem/sửa thông tin bản thân, đổi mật khẩu, admin khóa/mở tài khoản thường. Không sửa database schema, entity Account hoặc migration V1. Không triển khai quên mật khẩu, OTP, upload ảnh, frontend hoặc nghiệp vụ thiết bị.

## Chạy backend

Đảm bảo có JDK 17+ và Maven 3.6.3+. Nếu chạy bằng terminal, lệnh `mvn -v` phải hoạt động. Trong IntelliJ, có thể dùng Maven bundled, đặt biến môi trường trong Run Configuration và chạy `SmartAccessApplication`.

Trong PowerShell, từ thư mục gốc project:

```powershell
cd smart-access-control-backend
$databasePassword = Read-Host 'Mật khẩu database' -AsSecureString
$env:DB_PASSWORD = [System.Net.NetworkCredential]::new('', $databasePassword).Password
Remove-Variable databasePassword
try { mvn spring-boot:run } finally { Remove-Item Env:\DB_PASSWORD }
```

Mặc định kết nối database `smart_access` và chạy cổng 8080. Dừng backend cũ bằng Ctrl+C trong terminal của nó trước khi chạy lại. Cấu hình DB_URL/DB_USERNAME nếu dùng database khác. Spring Boot không tự đọc file `.env`.

Frontend vẫn dùng mock; chạy frontend không kiểm tra được các API mới. Dùng Postman hoặc PowerShell bên dưới.

## Xác thực và CSRF

Backend dùng Spring Security với cookie HTTP-only `JSESSIONID`, không dùng JWT. Session lưu trong bộ nhớ của **một backend instance**, hết hạn sau 1 giờ không hoạt động và mất khi backend khởi động lại. Chưa hỗ trợ nhiều instance; muốn mở rộng cần thống nhất session store dùng chung, nằm ngoài phạm vi hiện tại.

1. Gọi `GET /api/auth/csrf`, giữ cookie và nhận `{"headerName":"X-CSRF-TOKEN","token":"..."}`.
2. Gửi token ở header `X-CSRF-TOKEN` cho POST/PATCH/PUT/DELETE, kể cả đăng ký và đăng nhập.
3. Đăng nhập thành công tạo session mới; lấy CSRF token mới bằng GET ở bước 1.
4. Giữ cookie cho mọi request tiếp theo. Với fetch phía web, dùng `credentials: 'include'` và gửi header CSRF cho thao tác ghi.

CORS mặc định chỉ cho `http://localhost:8081` và `http://127.0.0.1:8081`, có credentials. Dùng nhất quán localhost hoặc 127.0.0.1. Có thể cấu hình danh sách origin bằng `CORS_ALLOWED_ORIGINS` (phân tách dấu phẩy). Profile prod đặt cookie Secure và yêu cầu HTTPS; session vẫn lưu trong bộ nhớ.

Trạng thái tài khoản và cờ admin được đọc từ database mỗi request. Session bị hủy sau khi transaction đổi mật khẩu/khóa/mở commit; rollback không hủy session. Phiên cũ trả 401 ở request tiếp theo, kể cả sau khi mở khóa. Yêu cầu đã được xử lý trước lúc khóa không bị thu hồi ngược.

## Các API

| Method | Path | Ai được dùng | Thành công |
| --- | --- | --- | --- |
| GET | `/api/auth/csrf` | Mọi người | 200 |
| POST | `/api/auth/register` | Mọi người, cần CSRF | 201, thông tin tài khoản |
| POST | `/api/auth/login` | Mọi người, cần CSRF | 200, thông tin tài khoản + session cookie |
| GET | `/api/accounts/me` | Đã đăng nhập | 200 |
| PATCH | `/api/accounts/me` | Đã đăng nhập | 200, thông tin sau cập nhật |
| PUT | `/api/accounts/me/password` | Đã đăng nhập | 204, không có body; đăng nhập lại |
| PATCH | `/api/admin/accounts/{accountId}/status` | Admin ACTIVE | 200 |

Response tài khoản chỉ gồm `accountId`, `fullName`, `email`, `phone`, `admin`, `status`. Không trả password/hash; client không tự đặt ID, admin, status hoặc hash qua đăng ký/cập nhật thông tin. Trường không thuộc DTO không được áp dụng.

### Đăng ký

```json
{"fullName":"Nguyễn Văn A","email":"user@example.test","phone":"0912345678","password":"<mật-khẩu-tự-chọn>"}
```

- Họ tên bắt buộc, tối đa 100 ký tự sau trim.
- Có ít nhất email hoặc phone; có thể nhập cả hai. Email tối đa 254 ký tự, trim và lowercase; tìm email không phân biệt hoa/thường.
- Phone gồm 8–15 chữ số, tùy chọn dấu `+` đầu chuỗi. Không tự chuyển `09...` thành `+849...`; đăng nhập dùng đúng dạng đã lưu.
- Mật khẩu ít nhất 8 ký tự theo Java String và tối đa 72 byte UTF-8 (giới hạn BCrypt). Không trim mật khẩu; không chấp nhận toàn khoảng trắng. Hash bằng BCrypt.
- Email/phone UNIQUE. Kiểm tra trước ở service; ràng buộc database xử lý cả đăng ký đồng thời.
- Tài khoản mới luôn là người dùng thường, ACTIVE. Không tự đăng nhập sau đăng ký.

### Đăng nhập

```json
{"identifier":"user@example.test","password":"<mật-khẩu-đã-đăng-ký>"}
```

Hoặc identifier là `0912345678`. Không dùng accountId hoặc username. Sai mật khẩu, không có tài khoản và tài khoản DISABLED cùng trả 401 với message `Invalid credentials or account disabled`. Đăng nhập thất bại không thay thế session đang có. Không hỗ trợ hash giả/plaintext từ fixture cũ; không tự sửa mật khẩu dữ liệu có sẵn.

### Cập nhật thông tin

```json
{"fullName":"Tên mới","email":"new@example.test","phone":"0987654321"}
```

PATCH chỉ áp dụng trường được gửi. Trường bỏ qua hoặc null giữ nguyên; `"email":""`/`"phone":""` xóa liên hệ tương ứng, nhưng phải còn ít nhất một liên hệ. `{}`, họ tên rỗng hoặc liên hệ không hợp lệ trả 400; trùng email/phone tài khoản khác trả 409. Không đổi mật khẩu, trạng thái hoặc quyền admin. Session hiện tại vẫn dùng được; lần đăng nhập sau dùng liên hệ mới. Chưa xác minh email/phone bằng OTP.

### Đổi mật khẩu

```json
{"currentPassword":"<mật-khẩu-hiện-tại>","newPassword":"<mật-khẩu-mới>"}
```

Sai mật khẩu cũ trả 400, không thay đổi hash/session. Thành công hash mật khẩu mới và hủy tất cả phiên của tài khoản sau commit. Mật khẩu cũ không đăng nhập được nữa. Đây là đổi mật khẩu khi đang đăng nhập, không phải reset mật khẩu bị quên.

### Admin khóa/mở tài khoản

```json
{"status":"DISABLED"}
```

Mở khóa dùng `{"status":"ACTIVE"}`. Chỉ admin ACTIVE được thao tác với tài khoản thường; không tự đổi trạng thái và không thao tác admin khác. Manager không có quyền này chỉ vì quản lý cửa. Cập nhật cùng trạng thái là idempotent, không ghi/hủy phiên lại.

Khóa giữ nguyên thông tin tài khoản, mật khẩu, membership, credential và lịch sử. Không phát lệnh xuống thiết bị offline. Mở khóa không khôi phục phiên cũ; người dùng phải đăng nhập lại. Không có API tạo admin, đổi is_admin hoặc xóa tài khoản.

### Lỗi

```json
{"status":400,"message":"Invalid request parameters or body"}
```

| Status | Ý nghĩa |
| --- | --- |
| 400 | Validation sai, mật khẩu hiện tại sai, xóa hết liên hệ hoặc ID không hợp lệ |
| 401 | Chưa đăng nhập, phiên hết hiệu lực hoặc đăng nhập thất bại |
| 403 | Không đủ quyền hoặc thiếu/sai CSRF |
| 404 | Admin thao tác tài khoản không tồn tại |
| 409 | Trùng liên hệ, xung đột dữ liệu/khóa database |

## Kiểm tra bằng Postman

Import `docs/postman/account.postman_collection.json` và `account.postman_environment.json`. Chọn environment, đặt baseUrl và bật cookie jar. Tự nhập accountPassword/newPassword tại máy, dùng hai mật khẩu khác nhau; các trường mật khẩu trong file đều để trống. Collection tự lấy CSRF trước request ghi, giữ cookie và sinh email/phone mới khi chạy request đăng ký. Các chuỗi `<...>` trong JSON minh họa là placeholder, không phải mật khẩu mặc định.

- Chạy thư mục **1. Tài khoản** theo thứ tự: đăng ký, trùng email/phone, login email/phone, sửa thông tin, đổi mật khẩu, kiểm tra phiên/mật khẩu cũ, người dùng không có quyền admin.
- Thư mục **2. Admin khóa và mở tài khoản** cần `adminIdentifier`/`adminPassword` của admin có sẵn. Chạy sau thư mục 1. Request đăng nhập sai của người bị khóa giữ session admin, để request tiếp theo mở khóa được.
- Collection tạo và sửa tài khoản thật trong database đang cấu hình. Dùng database kiểm thử riêng. Kiểu `secret` của Postman chỉ che giá trị khi hiển thị, không bảo đảm export đã loại mật khẩu. Không chia sẻ/export environment đã điền mật khẩu; nếu cần lưu cục bộ trong project, dùng tên `account.local.postman_environment.json` (được Git bỏ qua).

Nếu chưa có admin: trong database kiểm thử, đăng ký một tài khoản riêng qua API, ghi lại accountId; người quản trị database xác nhận tài khoản đó rồi đặt cờ admin. Thay `<id>` bằng ID đã xác minh:

```sql
SELECT account_id, full_name, email, phone, is_admin, status FROM accounts WHERE account_id = <id>;
UPDATE accounts SET is_admin = TRUE, updated_at = CURRENT_TIMESTAMP(3) WHERE account_id = <id> AND is_admin = FALSE;
```

Đăng nhập tài khoản đó để chạy thư mục admin. Ứng dụng không tự seed/promote tài khoản admin. Không cần và không được thay password_hash bằng plaintext.

## Kiểm tra nhanh bằng PowerShell

Ví dụ dưới đây tạo một tài khoản kiểm thử mới trên backend đang chạy:

```powershell
$base = 'http://localhost:8080'
$client = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$email = "account-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())@example.test"
$accountPasswordInput = Read-Host 'Mật khẩu tài khoản kiểm thử' -AsSecureString
$newPasswordInput = Read-Host 'Mật khẩu mới, khác mật khẩu cũ' -AsSecureString
$accountPassword = [System.Net.NetworkCredential]::new('', $accountPasswordInput).Password
$newPassword = [System.Net.NetworkCredential]::new('', $newPasswordInput).Password
try {
$csrf = Invoke-RestMethod "$base/api/auth/csrf" -WebSession $client
$headers = @{ 'X-CSRF-TOKEN' = $csrf.token }
$body = @{ fullName = 'Người dùng kiểm thử'; email = $email; password = $accountPassword } | ConvertTo-Json
Invoke-RestMethod "$base/api/auth/register" -Method Post -WebSession $client -Headers $headers -ContentType 'application/json' -Body $body
$body = @{ identifier = $email; password = $accountPassword } | ConvertTo-Json
Invoke-RestMethod "$base/api/auth/login" -Method Post -WebSession $client -Headers $headers -ContentType 'application/json' -Body $body
Invoke-RestMethod "$base/api/accounts/me" -WebSession $client

# Sau login lấy CSRF mới trước khi ghi dữ liệu.
$csrf = Invoke-RestMethod "$base/api/auth/csrf" -WebSession $client
$headers = @{ 'X-CSRF-TOKEN' = $csrf.token }
$body = @{ fullName = 'Tên đã cập nhật' } | ConvertTo-Json
Invoke-RestMethod "$base/api/accounts/me" -Method Patch -WebSession $client -Headers $headers -ContentType 'application/json' -Body $body
$body = @{ currentPassword = $accountPassword; newPassword = $newPassword } | ConvertTo-Json
Invoke-RestMethod "$base/api/accounts/me/password" -Method Put -WebSession $client -Headers $headers -ContentType 'application/json' -Body $body

# Kỳ vọng 401 vì đổi mật khẩu đã hủy session.
Invoke-RestMethod "$base/api/accounts/me" -WebSession $client
} finally {
  Remove-Variable accountPassword, newPassword, accountPasswordInput, newPasswordInput, body -ErrorAction SilentlyContinue
}
```

Sau 401, lấy CSRF mới rồi đăng nhập lại bằng mật khẩu mới.

## Test tự động

```powershell
mvn test
```

Unit/HTTP tests không cần MySQL; hai lớp integration bị bỏ qua nếu không đặt `SMART_ACCESS_DB_TEST_URL`.

Chạy đầy đủ trên database MySQL kiểm thử riêng, đã được tạo trước (không đặt URL database đang dùng):

```powershell
$env:SMART_ACCESS_DB_TEST_URL = 'jdbc:mysql://localhost:3306/smart_access_test?serverTimezone=Asia/Ho_Chi_Minh'
$env:SMART_ACCESS_DB_TEST_USERNAME = '<test-user>'
$testDatabasePassword = Read-Host 'Mật khẩu database kiểm thử' -AsSecureString
$env:SMART_ACCESS_DB_TEST_PASSWORD = [System.Net.NetworkCredential]::new('', $testDatabasePassword).Password
Remove-Variable testDatabasePassword
try { mvn test } finally { Remove-Item Env:\SMART_ACCESS_DB_TEST_PASSWORD }
```

`DatabaseIntegrationTest` kiểm tra Flyway V1, schema và mapping. `AccountIntegrationTest` chạy security/controller/service/repository thật với MySQL: login email/phone, cập nhật thông tin, hủy nhiều session, khóa/mở, bảo toàn membership, rollback và đăng ký đồng thời. Test chỉ dọn các fixture do chính nó tạo; schema giữ lại.

Bộ Postman và cách chuẩn bị fixture Manager được hướng dẫn tại [manager-api.md](manager-api.md).
