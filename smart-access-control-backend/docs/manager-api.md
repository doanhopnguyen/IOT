# Manager API — giữ nguyên schema hiện có

## Phạm vi và giới hạn

Dùng MySQL, Java Long/BIGINT và toàn bộ 11 bảng hiện có. Không sửa model, V1, script tạo database, datasource, không có migration mới. Spring Security xác thực bằng HTTP session. Đăng ký/đăng nhập tại /api/auth; Manager API yêu cầu cookie JSESSIONID, thao tác ghi cần X-CSRF-TOKEN. Không dùng JWT.

Đã triển khai tìm account/email, xem người thuộc cửa, thu hồi riêng từng quyền, xóa membership không có face request history, gán thiết bị có sẵn chưa thuộc cửa. Ghi REVOKE_PERMISSION, REMOVE_USER_FROM_UNIT, REGISTER_DEVICE bằng AuditLog hiện có, trong cùng transaction với cập nhật nghiệp vụ.

Chưa triển khai gửi/xem/accept/reject invitation: schema không có nơi lưu invitation. Không dùng face_requests/audit_logs làm kho invitation; không thêm người vào cửa qua API Manager. Không dùng memory để giả lập invitation, vì mất trạng thái khi restart và không đảm bảo transaction nhiều instance.

Mọi PATCH có ít nhất một quyền true bị từ chối 409, kể cả khi quyền đó đang true. Chưa thể xác minh invitation ACCEPTED. Chỉ PATCH với false và trường bỏ qua/null mới được xử lý. Không mặc định membership có sẵn là đã accept và không tạo lịch sử ACCEPTED giả.

Membership có face_requests không thể xóa do FK RESTRICT. DELETE trả 409 và không thay đổi quyền. Có thể gọi PATCH thu hồi cả bốn quyền, nhưng người đó vẫn là thành viên trong danh sách; không giả lập trạng thái inactive. Không có accessStatus trong DTO vì schema không có trường tương ứng; accountStatus là trạng thái tài khoản.

## Khởi chạy

Theo README: tạo database MySQL, đặt DB_URL/DB_USERNAME/DB_PASSWORD và chạy mvn spring-boot:run trong smart-access-control-backend. Flyway V1 và Hibernate validate giữ nguyên.

Không có username trong Account. type=account tìm chính xác accountId dạng số; trường response account là chuỗi accountId. type=email tìm email chính xác, không phân biệt hoa/thường. type=auto chọn accountId khi keyword toàn số, còn lại tìm email. displayName map từ fullName; deviceCode map từ deviceUid. Không expose entity hoặc password/device secret.

## Danh sách API

Tất cả API lấy managerId từ tài khoản đang đăng nhập; query managerId không còn xác định người thực hiện. ManagerService kiểm tra account tồn tại. Search yêu cầu account quản lý ít nhất một access unit. Các API theo cửa kiểm tra AccessUnit.manager.accountId == managerId tại Service trước khi đọc/sửa người hoặc thiết bị. is_admin không bỏ qua kiểm tra cửa. API sửa membership không cho sửa membership của admin hoặc tài khoản quản lý một cửa.

| Method | Path | Thành công |
| --- | --- | --- |
| GET | /api/manager/users/search?keyword=3&type=account | 200, danh sách 0 hoặc 1 tài khoản |
| GET | /api/manager/users/search?keyword=user@example.test&type=email | 200 |
| GET | /api/manager/units/10/users | 200, danh sách membership |
| PATCH | /api/manager/units/10/users/3/permissions | 200, quyền còn lại |
| POST | /api/manager/units/10/member-profiles | 201, tạo tài khoản tối thiểu + thêm vào cửa 10 |
| DELETE | /api/manager/units/10/users/3 | 204, xóa user_access cửa 10 (kèm tài khoản nếu là hồ sơ chưa đăng nhập) |
| POST | /api/manager/units/10/devices | 201, thông tin thiết bị |

Các URL invitation chưa đăng ký; không gọi chúng để test flow thành công. Namespace /api/manager không có endpoint tạo account, tạo user_access, đổi manager hay thay đổi is_admin. Đăng ký tài khoản thường thuộc /api/auth/register.

### Search response

```json
[{"id":3,"account":"3","email":"user@example.test","displayName":"User","status":"ACTIVE"}]
```

Không tìm thấy trả []. Manager không tồn tại trả 404; account không quản lý cửa nào trả 403; keyword rỗng, quá dài, type lạ hoặc type=account không có số Long dương trả 400.

### Xem thành viên

```json
[{"userId":3,"account":"3","email":"user@example.test","displayName":"User","accountStatus":"ACTIVE","allowFace":true,"allowFingerprint":false,"allowRfid":true,"allowRemoteUnlock":false}]
```

Query chỉ lấy user_access thuộc unit đã kiểm tra; không kèm dữ liệu credential hay lịch sử cửa khác.

### Thu hồi quyền

```json
{"allowFace":false}
```

Chỉ tắt Face; ba quyền khác giữ nguyên. JSON null hoặc trường bỏ qua giữ nguyên giá trị. Thu hồi tất cả:

```json
{"allowFace":false,"allowFingerprint":false,"allowRfid":false,"allowRemoteUnlock":false}
```

Body {} hoặc toàn null trả 400. User không tồn tại trả 404. User tồn tại nhưng không thuộc cửa trả 409. Nếu có bất kỳ true nào, trả 409 và không áp dụng phần false trong cùng request. Thu hồi không xóa account, membership hoặc credentials. Audit lưu before/after bốn boolean và unitId/accountId; PATCH không thay đổi giá trị không tạo audit mới.

### Xóa người

Không có body. User không tồn tại/không thuộc cửa trả 404. Có face request history trả 409. Khi xóa thành công, chỉ xóa dòng khóa kép (userId, unitId); account và membership cửa khác được giữ lại. Không tự xóa face_requests hoặc credential để né FK. FK vẫn bảo vệ nếu lịch sử được thêm đồng thời.

Ngoại lệ: hồ sơ do chủ chính cửa này tạo (xem mục dưới), chưa từng đăng nhập, không thuộc cửa khác và không quản lý cửa nào thì tài khoản bị xử lý theo:
- Còn vân tay ACTIVE → 409, phải xóa vân tay trên thiết bị trước.
- Không có access_logs → xóa credentials rồi xóa hẳn account.
- Có access_logs (FK RESTRICT) → ẩn: status DISABLED, phone = null, email = `deleted-<id>@noapp.local`, giữ full_name cho lịch sử; credential ACTIVE chuyển REVOKED.

Audit REMOVE_USER_FROM_UNIT có thêm `details.account` = KEPT / DELETED / HIDDEN.

### Thêm người chưa có ứng dụng

```json
{"fullName":"Nguyễn Văn B","contact":"0912000111","room":"P302"}
```

`contact` là số điện thoại (8–15 số) hoặc email, `room` không bắt buộc (tối đa 50 ký tự). Backend tạo account với mật khẩu mặc định `123456` và user_access với allowFingerprint/allowRfid = true, allowRemoteUnlock = false. Contact đã có tài khoản trả 409 (dùng tìm kiếm + thêm người đã có ứng dụng).

Schema không có cột đánh dấu hay cột phòng, nên dùng audit_logs (chỉ thêm dữ liệu): `CREATE_MEMBER_PROFILE` (entity ACCOUNT, details {unitId, createdBy, room}) và `FIRST_LOGIN` (ghi khi tài khoản đó đăng nhập thành công lần đầu). GET danh sách thành viên trả thêm `phone`, `room`, `hasLoggedIn`, `deletableAccount`.

### Đăng ký thiết bị

```json
{"deviceCode":"SD-001-ABC"}
```

```json
{"deviceId":30,"deviceCode":"SD-001-ABC","deviceName":"Door device","unitId":10,"deviceType":"DOOR_CONTROLLER","lifecycleStatus":"REGISTERED"}
```

Device phải tồn tại và chưa gán unit; device SUSPENDED/DECOMMISSIONED/MAINTENANCE bị từ chối 409. Không đổi lifecycle hoặc secret. Thiết bị đã thuộc chính cửa hoặc cửa khác đều trả 409. Không tìm thấy trả 404. Mã rỗng/quá 64 ký tự trả 400. Service khóa unit và device bằng PESSIMISTIC_WRITE trong transaction; chỉ gán unit_id của thiết bị có sẵn.

### Lỗi

```json
{"status":403,"message":"Manager does not manage this access unit"}
```

Manager/cửa không tồn tại: 404. Khác manager_id/cửa chưa gán manager: 403. ID/request sai: 400. Xung đột FK/khóa hoặc trạng thái nghiệp vụ: 409. Không trả chi tiết SQL, hash hay secret trong thông báo lỗi.

## Postman

1. Khởi tạo một database MySQL kiểm thử riêng bằng cấu hình dự án. Chạy ứng dụng để Flyway V1 tạo schema, chuẩn bị `@fixture_password_hash` theo hướng dẫn bên dưới, rồi chạy docs/postman/manager-fixture.sql đúng một lần bằng MySQL client trong database đó. Script chỉ tạo dữ liệu fixture theo schema hiện có; không chạy trên database đang sử dụng.
2. Import manager.postman_collection.json và manager.postman_environment.json trong docs/postman.
3. Điền managerId, otherManagerId, unitId, otherUnitId, userId, historyUserId, nonmemberId bằng kết quả SELECT cuối fixture. baseUrl mặc định http://localhost:8080. Không đặt Authorization; đăng nhập đúng manager bằng /api/auth/login, giữ cookie và lấy CSRF token mới qua /api/auth/csrf. Gửi X-CSRF-TOKEN cho request ghi.
4. Điền managerIdentifier/managerPassword và otherManagerIdentifier/otherManagerPassword cục bộ. Hai manager fixture dùng mật khẩu kiểm thử tự chọn tương ứng với @fixture_password_hash; xem cách chuẩn bị bên dưới. Không ghi mật khẩu/hash vào file SQL hoặc environment được Git theo dõi. Cookie jar bật; pre-request tự login đúng manager và lấy CSRF. Chạy collection theo thứ tự: tìm account/email; đọc thành viên; kiểm tra cửa khác; kiểm tra bật quyền bị từ chối; tắt từng quyền; kiểm tra thiết bị không có/đã gán; đăng ký thiết bị chưa gán; xóa membership có lịch sử bị từ chối; thu hồi quyền người có lịch sử; xóa người không có lịch sử; xác nhận account và membership cửa khác còn tồn tại.
5. Các request làm thay đổi dữ liệu. Trước khi chạy lại toàn bộ, dùng database fixture mới hoặc khôi phục dữ liệu fixture. Không chạy script lần hai lên cùng dữ liệu vì email/deviceUid UNIQUE. Không tự chạy cleanup trên database dùng chung.

Collection kiểm tra HTTP status, response phù hợp từng flow và bảo toàn account/cửa khác. Request 22/23 kiểm tra query managerId giả hoặc thiếu không thay đổi danh tính session.

Trước khi chạy fixture ở bước 1, đăng ký một tài khoản kiểm thử riêng qua `/api/auth/register` với mật khẩu tự chọn và ghi lại ID. Trong cùng session MySQL dùng để chạy fixture, lấy hash từ tài khoản đó mà không in hash ra màn hình:

```sql
SET @fixture_password_hash = (
  SELECT password_hash FROM accounts
  WHERE account_id = <test-account-id> AND is_admin = FALSE AND status = 'ACTIVE'
);
SELECT @fixture_password_hash IS NOT NULL AS ready;
```

Chỉ chạy `SOURCE .../manager-fixture.sql` khi `ready = 1`, trên database kiểm thử riêng. Điền mật khẩu đã tự chọn vào các trường managerPassword/otherManagerPassword tại máy. File fixture không có credential mặc định; chưa đặt biến thì INSERT account bị từ chối do password_hash NOT NULL. Không sửa file SQL để điền hash, không export environment chứa credential lên Git. Bản local có thể đặt tên `manager.local.postman_environment.json` để được Git bỏ qua.

## Đối chiếu 22 test yêu cầu ban đầu

| # | Trường hợp | Kết quả/phạm vi |
| --- | --- | --- |
| 1 | Tìm bằng account | Test accountId, không có username |
| 2 | Tìm bằng email | Đã kiểm thử Service/HTTP |
| 3 | User không tồn tại | Search [] và thao tác 404 |
| 4–8 | Gửi, PENDING, accept, reject, invitation duplicate | Chưa hỗ trợ: schema không có invitation |
| 9 | Danh sách thành viên | Đã kiểm thử |
| 10 | Cửa khác manager | 403 trên đọc/sửa/xóa/đăng ký |
| 11–14 | Cấp bốn quyền | Test từ chối 409; chưa có flow thành công |
| 15 | Tắt từng quyền | Đã kiểm thử bốn quyền riêng |
| 16 | Cấp khi chưa accept | Từ chối cấp; không có fixture invitation PENDING |
| 17 | Xóa khỏi cửa | Thành công nếu không có face_requests; có lịch sử trả 409 |
| 18 | Account và cửa khác vẫn tồn tại | Unit test xóa đúng membership; Postman có kiểm tra sau xóa |
| 19 | Đăng ký device | Đã kiểm thử Service/HTTP |
| 20 | Device không tồn tại | 404 |
| 21 | Device thuộc cửa khác | 409 |
| 22 | Device thuộc cửa hiện tại | 409 |

## Kiểm thử tự động và giới hạn

ManagerServiceTest dùng mock repository; ManagerControllerTest dùng MockMvc, mock Service và chạy qua SecurityFilterChain với session/CSRF. Những kiểm thử này không chứng minh rollback/khóa trên MySQL thật; cần database kiểm thử để xác minh hành vi runtime và tích hợp repository.

Theo README có thể chạy toàn bộ test với SMART_ACCESS_DB_TEST_URL/USERNAME/PASSWORD trên MySQL riêng. Không chạy vào database production. DatabaseIntegrationTest hiện kiểm tra V1/entity/schema, chưa có test transaction đa thao tác của Manager trên MySQL.

Hướng dẫn đăng ký, đăng nhập và quản lý tài khoản: [account-api.md](account-api.md).
