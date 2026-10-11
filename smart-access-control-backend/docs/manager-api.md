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
| GET | /api/manager/users/search?managerId=1&keyword=3&type=account | 200, danh sách 0 hoặc 1 tài khoản |
| GET | /api/manager/users/search?managerId=1&keyword=user@example.test&type=email | 200 |
| GET | /api/manager/units/10/users?managerId=1 | 200, danh sách membership |
| PATCH | /api/manager/units/10/users/3/permissions?managerId=1 | 200, quyền còn lại |
| DELETE | /api/manager/units/10/users/3?managerId=1 | 204, chỉ xóa user_access cửa 10 |
| POST | /api/manager/units/10/devices?managerId=1 | 201, thông tin thiết bị |

Các URL invitation chưa đăng ký; không gọi chúng để test flow thành công. Không có endpoint tạo account, tạo user_access, đổi manager hay thay đổi is_admin.

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

1. Khởi tạo một database MySQL kiểm thử riêng bằng cấu hình dự án. Chạy ứng dụng để Flyway V1 tạo schema, rồi tùy chọn chạy docs/postman/manager-fixture.sql đúng một lần bằng MySQL client trong database đó. Script chỉ INSERT dữ liệu theo schema hiện có; chưa được tự động chạy trong tác vụ này.
2. Import manager.postman_collection.json và manager.postman_environment.json trong docs/postman.
3. Điền managerId, otherManagerId, unitId, otherUnitId, userId, historyUserId, nonmemberId bằng kết quả SELECT cuối fixture. baseUrl mặc định http://localhost:8080. Không đặt Authorization; đăng nhập đúng manager bằng /api/auth/login, giữ cookie và lấy CSRF token mới qua /api/auth/csrf. Gửi X-CSRF-TOKEN cho request ghi.
4. Chạy collection theo thứ tự: tìm account/email; đọc thành viên; kiểm tra cửa khác; kiểm tra bật quyền bị từ chối; tắt từng quyền; kiểm tra thiết bị không có/đã gán; đăng ký thiết bị chưa gán; xóa membership có lịch sử bị từ chối; thu hồi quyền người có lịch sử; xóa người không có lịch sử; xác nhận account và membership cửa khác còn tồn tại.
5. Các request làm thay đổi dữ liệu. Trước khi chạy lại toàn bộ, dùng database fixture mới hoặc khôi phục dữ liệu fixture. Không chạy script lần hai lên cùng dữ liệu vì email/deviceUid UNIQUE. Không tự chạy cleanup trên database dùng chung.

Collection có 29 request với kiểm tra HTTP status, response phù hợp từng flow và bảo toàn account/cửa khác. Các phép thử chưa được chạy trên Postman/live MySQL trong tác vụ này.

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

mvn clean test: BUILD SUCCESS; 53 test mới thành công (43 Service, 10 HTTP), 4 DatabaseIntegrationTest cũ bỏ qua khi chưa có SMART_ACCESS_DB_TEST_URL. Service test dùng mock repository; HTTP test dùng MockMvc và mock Service. Những kiểm thử này không chứng minh rollback/khóa trên MySQL thật. Transaction annotation và PESSIMISTIC_WRITE đã có trong code; cần database kiểm thử để xác minh hành vi runtime và tích hợp repository.

Theo README có thể chạy toàn bộ test với SMART_ACCESS_DB_TEST_URL/USERNAME/PASSWORD trên MySQL riêng. Không chạy vào database production. DatabaseIntegrationTest hiện kiểm tra V1/entity/schema, chưa có test transaction đa thao tác của Manager trên MySQL.

## Tích hợp Authentication sau này

Cả năm method của ManagerController đã lấy accountId từ AccountPrincipal của session rồi truyền vào ManagerService. validateManagerAccess và kiểm tra membership giữ nguyên. Các query managerId trong ví dụ/bộ Postman cũ không còn tác dụng; cần đăng nhập đúng manager và gửi CSRF cho request ghi. Chưa có accountId cho accept/reject vì invitation chưa triển khai.

Để hoàn thành flow invitation và cấp quyền, cần cơ chế lưu invitation được thống nhất hoặc nguồn invitation sẵn có do team khác cung cấp. Giữ schema hiện tại đồng nghĩa các chức năng này chưa thể hoàn thành đúng yêu cầu.

## File thay đổi

Tạo mới:
- src/main/java/com/smartaccess/controller/ManagerController.java
- src/main/java/com/smartaccess/service/ManagerService.java
- src/main/java/com/smartaccess/dto/manager/{UserSearchResponse,UnitUserResponse,PermissionRequest,RegisterDeviceRequest,DeviceResponse}.java
- src/main/java/com/smartaccess/exception/{BusinessException,GlobalExceptionHandler}.java
- src/test/java/com/smartaccess/service/ManagerServiceTest.java
- src/test/java/com/smartaccess/controller/ManagerControllerTest.java
- docs/manager-api.md, docs/manager-source.md, docs/manager-implementation-proposal.md
- docs/postman/manager.postman_collection.json, manager.postman_environment.json, manager-fixture.sql

Sửa: pom.xml (bỏ dependency Security), README.md (phạm vi Manager/đường dẫn docs), năm repository Account/AccessUnit/UserAccess/Device/FaceRequest (thêm truy vấn, giữ API cũ).

Không sửa model/schema/migration/application config. Không có migration mới. Báo cáo manager-implementation-proposal.md lưu đề xuất ban đầu với chú thích đã rút đề xuất schema. Code hoàn chỉnh của các file Java/POM tạo hoặc sửa nằm trong manager-source.md.
