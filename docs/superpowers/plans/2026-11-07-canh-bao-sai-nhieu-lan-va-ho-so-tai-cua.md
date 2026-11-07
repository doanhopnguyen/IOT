# Cảnh báo sai PIN / xác thực sai nhiều lần + Thêm thành viên chưa có tài khoản — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chủ cửa nhận cảnh báo khi có người nhập sai PIN nhiều lần hoặc xác thực sai (vân tay, thẻ RFID, khuôn mặt) nhiều lần tại cửa; và chủ cửa thêm được người chưa có tài khoản dưới dạng "hồ sơ chỉ dùng tại cửa".

**Architecture:** Firmware gửi thêm các lượt sai hiện đang bị bỏ qua (PIN sai, vân tay không nhận ra) qua bản tin `access` có sẵn, backend ghi vào `access_logs` như cũ. `AlertRuleService` (chạy 30 s/lần) thay quy tắc gộp `REPEATED_DENIED` bằng hai quy tắc riêng `REPEATED_WRONG_PIN` và `REPEATED_AUTH_FAILED`, ghi vào bảng `events`. App đã tự hỏi `/api/alerts` 30 s/lần và hiện thông báo cho WARNING/CRITICAL, nên không cần sửa phần cảnh báo trên app. Hồ sơ tại cửa dùng lại `MemberProfileService` và API `POST /api/manager/units/{unitId}/member-profiles`, nhưng không có mật khẩu dùng được và không cần SĐT/email.

**Tech Stack:** Java 17, Spring Boot, JPA, JUnit 5 + Mockito + AssertJ; Arduino C++ (ESP32-S3, PlatformIO), Python 3 (test firmware); Expo/React Native TypeScript, `node --test`.

**Spec:** Yêu cầu của người dùng ngày 07/11/2026 (không có file spec riêng): "bổ sung các cảnh báo như sai PIN nhiều lần, xác thực sai nhiều lần và chức năng thêm thành viên chưa có tài khoản". Đã chốt:
- "Xác thực sai" là sai **tại cửa**: vân tay, thẻ RFID, khuôn mặt. PIN có cảnh báo riêng. Không làm cảnh báo đăng nhập app sai.
- "Chưa có tài khoản" theo hướng **hồ sơ chỉ dùng tại cửa**: họ tên + phòng, không cần SĐT/email, mật khẩu ngẫu nhiên không ai biết. Người đó chỉ dùng vân tay/thẻ tại cửa. Làm đúng nguyên tắc ở `docs/FLOW_HE_THONG.md:122`: "Không dùng mật khẩu mặc định chung".

## Global Constraints

- Không thêm cột, không thêm migration Flyway, không sửa entity. Chỉ dùng `access_logs(method, result, reason_code, occurred_at)`, `events(event_type, severity, alert_status, message, occurred_at)`, `accounts`, `user_access`, `audit_logs.details` như hiện có.
- `accounts` có ràng buộc `chk_accounts_contact` (phải có phone hoặc email): hồ sơ tại cửa dùng email giả `profile-<UUID>@noapp.local`. Hằng `MemberProfileService.NO_APP_DOMAIN = "@noapp.local"` (đã dùng cho `deleted-<id>@noapp.local`).
- Giao thức firmware chỉ được **thêm** bản tin; giữ nguyên trường của `access`: `eventUuid, method, result, occurredAt, rfidUid?, templateId?`.
- Ngưỡng cảnh báo (hằng trong `AlertRuleService`):
  - `REPEATED_WRONG_PIN`, CRITICAL: ≥ `PIN_LIMIT = 5` lượt `method=PIN, result=DENIED` trong `PIN_WINDOW_SEC = 300`. Số 5 khớp với việc firmware khóa bàn phím sau 5 lần sai (`offline_door.ino:440`).
  - `REPEATED_AUTH_FAILED`, CRITICAL: ≥ `AUTH_LIMIT = 5` lượt DENIED của `FINGERPRINT`, `RFID`, `FACE` trong `AUTH_WINDOW_SEC = 120`.
  - Không tính các lượt có `reason_code` chứa `DOOR_BUSY`, `FACE_DISABLED` hoặc `MODEL_MISMATCH`: đó là lỗi của hệ thống, không phải người thử mở.
  - Cả hai đều không tự đóng (`autoResolve = false`), giống `REPEATED_DENIED` cũ.
- Nội dung cảnh báo bằng tiếng Việt, tối đa 255 ký tự (`apply()` đã cắt sẵn):
  - PIN: `Cửa <tên thiết bị>: nhập sai PIN <n> lần trong 5 phút, nghi có người dò mã`
  - Xác thực: `Cửa <tên thiết bị>: xác thực sai <n> lần trong 2 phút (vân tay <a>, thẻ <b>, khuôn mặt <c>)`. Bỏ phương thức nào có 0 lượt; giữ đúng thứ tự vân tay → thẻ → khuôn mặt.
- Theo ghi nhớ của dự án, người dùng tự chạy lệnh git. Bước "Commit" trong plan là lệnh gợi ý để người dùng tự chạy; người hoặc agent thực thi plan không tự commit.
- Mỗi task phải chạy xanh trước khi bàn giao: `cd smart-access-control-backend && mvn test`; khi đụng mobile thì thêm `cd IOT_mobile && npm run typecheck && npm test`; khi đụng firmware thì thêm `python firmware/tests/<file>.py`.

## Review Focus

1. **Đóng cảnh báo xong lại bị tạo lại ngay**: chủ cửa bấm "Đã xử lý" khi 5 lượt sai vẫn còn trong cửa sổ 2–5 phút. Lần chạy kế tiếp không được tạo cảnh báo mới từ chính các lượt đó, mà chỉ đếm các lượt xảy ra **sau** cảnh báo gần nhất cùng loại của thiết bị. → test `resolvedAlertIsNotRecreatedFromSameAttempts` (Task 2).
2. **Một người lạ đứng trước camera**: node khuôn mặt gửi `UNKNOWN_FACE` tối đa 10 s/lần (`face-node/config.py:41`). Đứng 50 s sẽ có 5 lượt và phải ra **một** cảnh báo (không nhân bản); còn `DOOR_BUSY`/`FACE_DISABLED` không được tính. → test `systemReasonsAreNotCountedAsAttempts` + `openAlertIsNotDuplicated` (Task 2).
3. **Nhập sai PIN khi bàn phím đang bị khóa 30 s** không phải lượt thử mới: firmware không gửi bản tin (nhánh `pinBlocked` return trước khi so PIN). → test `blockedKeypadDoesNotReport` (Task 1).
4. **Chủ cửa khác tìm thấy hồ sơ tại cửa** qua tìm kiếm theo mã tài khoản rồi gửi lời mời mà người đó không bao giờ chấp nhận được. `searchUsers` phải bỏ qua tài khoản có email đuôi `@noapp.local`. → test `searchSkipsDoorOnlyProfiles` (Task 3).
5. **Email giả lộ ra app**: danh sách thành viên không được hiện `profile-…@noapp.local`; `UnitUserResponse.email` trả `null` cho hồ sơ tại cửa, và app hiện "Chỉ dùng tại cửa". → test `doorOnlyProfileHidesPlaceholderEmail` (Task 3) + `memberContactLabel` (Task 4).

---

### Task 1: Firmware gửi lượt PIN sai và vân tay không nhận ra

**Files:**
- Modify: `firmware/offline_door/offline_door.ino` — `submitPin()` (nhánh `if (!ok)`, ~dòng 740) và đoạn `fingerFastSearch()` ở màn HOME (~dòng 884)
- Modify: `firmware/connected_door/main.cpp:5` — `FIRMWARE_VERSION "1.8.0"` → `"1.9.0"`
- Create: `firmware/tests/test_failed_attempt_reporting.py`

**Interfaces:**
- Consumes: `connectedRecord(const char *method, bool granted, const char *uid, int fingerId)` (có sẵn ở `connected_door/network.h:134`; `fingerId = -1` thì không gửi `templateId`).
- Produces: bản tin `access` mới, `{"method":"PIN","result":"DENIED"}` và `{"method":"FINGERPRINT","result":"DENIED"}` không có `templateId`. Backend đã nhận được sẵn: `AccessEventService.recordLocal` chấp nhận PIN/FINGERPRINT + DENIED và ghi `reason_code = LOCAL_ACCESS_DENIED`.

- [ ] **Step 1: Viết test thất bại** `firmware/tests/test_failed_attempt_reporting.py`, cùng kiểu với `test_offline_door.py` (đọc source rồi cắt bằng `between`). Dùng script chạy trực tiếp với `assert`, không cần pytest:
  - `wrong_pin_reports_denied`: đoạn `submitPin()` (từ `void submitPin()` đến `bool adminPin=`) có lời gọi `connectedRecord("PIN",false,"",-1)` nằm trong `#ifdef CONNECTED_DOOR`, đặt trong nhánh `if (!ok)` và **trước** `denyPin()`.
  - `blocked_keypad_does_not_report`: dòng chứa `if (pinBlocked)` trong `submitPin()` nằm trước lời gọi trên, và không chứa `connectedRecord`.
  - `unknown_finger_reports_denied`: ở màn HOME có lời gọi `connectedRecord("FINGERPRINT",false,"",-1)` khi `result==FINGERPRINT_NOTFOUND && screen==HOME && !connectedIsEnrolling()`, nằm trong `#ifdef CONNECTED_DOOR`.
  - `firmware_version_bumped`: `connected_door/main.cpp` chứa `#define FIRMWARE_VERSION "1.9.0"`.
  - Cuối script in `OK failed-attempt reporting`.

- [ ] **Step 2: Chạy test, phải FAIL**

Run: `python firmware/tests/test_failed_attempt_reporting.py`
Expected: `AssertionError` ở `wrong_pin_reports_denied`.

- [ ] **Step 3: Sửa firmware**
  - `submitPin()`: đổi `if (!ok) { denyPin(); ... }` thành: dưới `#ifdef CONNECTED_DOOR` gọi `connectedRecord("PIN",false,"",-1);` rồi mới `denyPin(); tell(...)`. Áp dụng cho cả màn HOME và ADMIN_LOGIN, vì cả hai đều là đoán PIN tại cửa.
  - Đoạn tìm vân tay ở màn HOME: đổi `if (result!=FINGERPRINT_OK) { tell("Fingerprint not recognized"); return; }` để khi `result==FINGERPRINT_NOTFOUND && screen==HOME && !connectedIsEnrolling()` thì gọi thêm (dưới `#ifdef CONNECTED_DOOR`) `connectedRecord("FINGERPRINT",false,"",-1);`. Lỗi cảm biến khác `NOTFOUND` thì không gửi.
  - Tăng `FIRMWARE_VERSION` lên `"1.9.0"`.

- [ ] **Step 4: Chạy test và build, phải PASS**

Run: `python firmware/tests/test_failed_attempt_reporting.py && python firmware/tests/test_offline_door.py && cd firmware && pio run -c platformio.connected.ini`
Expected: `OK failed-attempt reporting`, test cũ vẫn xanh, build `SUCCESS`.

- [ ] **Step 5: Commit (người dùng tự chạy)**

```bash
git add firmware/offline_door/offline_door.ino firmware/connected_door/main.cpp firmware/tests/test_failed_attempt_reporting.py
git commit -m "feat(firmware): report wrong PIN and unknown fingerprint as denied access"
```

---

### Task 2: Hai quy tắc cảnh báo `REPEATED_WRONG_PIN` và `REPEATED_AUTH_FAILED`

**Files:**
- Modify: `smart-access-control-backend/src/main/java/com/smartaccess/service/AlertRuleService.java`
- Modify: `smart-access-control-backend/src/main/java/com/smartaccess/repository/AccessLogRepository.java`
- Modify: `smart-access-control-backend/src/main/java/com/smartaccess/repository/EventRepository.java`
- Test: `smart-access-control-backend/src/test/java/com/smartaccess/service/AlertRuleServiceTest.java`

**Interfaces:**
- Consumes: `access_logs` do Task 1 (PIN/FINGERPRINT DENIED), `AccessEventService` (RFID DENIED) và `FaceRecognitionService` (FACE DENIED) ghi.
- Produces:
  - `AlertRuleService.REPEATED_WRONG_PIN = "REPEATED_WRONG_PIN"`, `AlertRuleService.REPEATED_AUTH_FAILED = "REPEATED_AUTH_FAILED"`; các hằng package-private `PIN_WINDOW_SEC = 300`, `PIN_LIMIT = 5`, `AUTH_WINDOW_SEC = 120`, `AUTH_LIMIT = 5`, `Set<String> IGNORED_REASONS = Set.of("DOOR_BUSY","FACE_DISABLED","MODEL_MISMATCH")`.
  - Bỏ hằng `REPEATED_DENIED` cùng `DENIED_WINDOW_SEC` và `DENIED_LIMIT`. Các dòng `REPEATED_DENIED` cũ trong DB vẫn hiển thị được vì app dùng `message`.
  - `AccessLogRepository.findByAccessUnit_UnitIdAndMethodInAndResultAndOccurredAtAfter(Long unitId, Collection<AccessMethod> methods, AccessResult result, LocalDateTime after): List<AccessLog>`.
  - `EventRepository.findFirstByDevice_DeviceIdAndEventTypeOrderByOccurredAtDesc(Long deviceId, String eventType): Optional<Event>`.
  - Nếu `countByAccessUnit_UnitIdAndResultAndOccurredAtGreaterThanEqual` không còn ai dùng (kiểm tra bằng grep, `AdminDashboardService` có thể dùng) thì xóa; còn dùng thì giữ.

- [ ] **Step 1: Viết test thất bại** trong `AlertRuleServiceTest`. Thay helper `denied(long)` bằng `attempts(AccessMethod method, String reason, int count)`; helper này stub `findByAccessUnit_UnitIdAndMethodInAndResultAndOccurredAtAfter(eq(10L), any(), eq(AccessResult.DENIED), any())` trả về `count` bản ghi `AccessLog`. Bỏ hai test `REPEATED_DENIED` cũ, thêm:
  - `fourWrongPinsRaiseNothingFiveRaiseCritical`: 4 PIN → `evaluate(now) == 0`; 5 PIN → `== 1`, sự kiện có `eventType == REPEATED_WRONG_PIN`, `severity == CRITICAL`, `message == "Cửa Cửa chính: nhập sai PIN 5 lần trong 5 phút, nghi có người dò mã"`.
  - `mixedAuthFailuresRaiseOneCriticalWithBreakdown`: 2 FINGERPRINT + 3 RFID → đúng 1 sự kiện `REPEATED_AUTH_FAILED`, `message == "Cửa Cửa chính: xác thực sai 5 lần trong 2 phút (vân tay 2, thẻ 3)"`.
  - `wrongPinsDoNotCountAsAuthFailures`: 5 PIN + 0 phương thức khác → chỉ tạo `REPEATED_WRONG_PIN`, không tạo `REPEATED_AUTH_FAILED`.
  - `systemReasonsAreNotCountedAsAttempts`: 5 FACE với reason `DOOR_BUSY` (và một biến thể `"LOCAL_ACCESS_DENIED,FACE_DISABLED"`) → `evaluate(now) == 0`.
  - `windowStartsAtLatestAlertOrWindow`: không có cảnh báo cũ → tham số `after` của truy vấn PIN là `now.minusSeconds(300)`, của truy vấn xác thực là `now.minusSeconds(120)`. Dùng `ArgumentCaptor` để kiểm tra.
  - `resolvedAlertIsNotRecreatedFromSameAttempts`: `findFirstByDevice_DeviceIdAndEventTypeOrderByOccurredAtDesc(7L, REPEATED_WRONG_PIN)` trả một cảnh báo RESOLVED có `occurredAt = now.minusSeconds(60)` → tham số `after` bằng đúng `now.minusSeconds(60)`, không phải `now.minusSeconds(300)`.
  - `repeatedWrongPinIsNotAutoResolved`: đang có cảnh báo OPEN, 0 lượt sai → vẫn `OPEN`.
  - Giữ `openAlertIsNotDuplicated` và chạy nó cho cả hai loại mới.

- [ ] **Step 2: Chạy test, phải FAIL**

Run: `cd smart-access-control-backend && mvn test -Dtest=AlertRuleServiceTest`
Expected: lỗi biên dịch vì chưa có `REPEATED_WRONG_PIN` / chưa có phương thức repository.

- [ ] **Step 3: Cài đặt trong `AlertRuleService.evaluate`**: thay khối `o3` bằng hai lời gọi `apply(...)` có `autoResolve = false`. Mốc đếm của từng loại:

```java
LocalDateTime since(Device d, String type, long windowSec, LocalDateTime now) {
    LocalDateTime windowStart = now.minusSeconds(windowSec);
    return events.findFirstByDevice_DeviceIdAndEventTypeOrderByOccurredAtDesc(d.getDeviceId(), type)
            .map(Event::getOccurredAt).filter(t -> t.isAfter(windowStart)).orElse(windowStart);
}
```

  Lọc các bản ghi có `reasonCode` (tách theo dấu phẩy) chứa phần tử nào thuộc `IGNORED_REASONS`. Đếm theo từng phương thức để ghép nội dung cảnh báo theo đúng mẫu ở Global Constraints. Cập nhật Javadoc đầu lớp với hai quy tắc mới.

- [ ] **Step 4: Chạy test, phải PASS**

Run: `cd smart-access-control-backend && mvn test`
Expected: `BUILD SUCCESS`; `AlertRuleServiceTest` và `AdminDashboardServiceTest` đều xanh.

- [ ] **Step 5: Commit (người dùng tự chạy)**

```bash
git add smart-access-control-backend/src
git commit -m "feat(alerts): split repeated denials into wrong-PIN and failed-authentication alerts"
```

---

### Task 3: Backend — hồ sơ chỉ dùng tại cửa

**Files:**
- Modify: `smart-access-control-backend/src/main/java/com/smartaccess/dto/manager/CreateMemberProfileRequest.java`
- Modify: `smart-access-control-backend/src/main/java/com/smartaccess/service/MemberProfileService.java` (`create`)
- Modify: `smart-access-control-backend/src/main/java/com/smartaccess/service/ManagerService.java:89-96` (`createMemberProfile`), `:46-63` (`searchUsers`)
- Modify: `smart-access-control-backend/src/main/java/com/smartaccess/dto/manager/UnitUserResponse.java` (`from`)
- Test: `MemberProfileServiceTest.java`, `ManagerServiceTest.java`, `controller/ManagerControllerTest.java`

**Interfaces:**
- Produces:
  - `record CreateMemberProfileRequest(@NotBlank @Size(max = 100) String fullName, @Size(max = 50) String room)` (bỏ `contact`).
  - `MemberProfileService.NO_APP_DOMAIN = "@noapp.local"`; `static boolean isDoorOnly(Account a)`: `true` khi `email` kết thúc bằng `NO_APP_DOMAIN`, không phân biệt hoa thường.
  - `POST /api/manager/units/{unitId}/member-profiles`, body `{fullName, room?}` → `201 UnitUserResponse` với `email = null`, `phone = null`, `hasLoggedIn = false`, `deletableAccount = true`, `allowFingerprint = true`, `allowRfid = true`, `allowRemoteUnlock = false`, `allowFace = false`.
  - Giữ nguyên `describe`, `recordLogin`, `isDisposable`, `dispose` (xóa hoặc ẩn khi gỡ khỏi cửa): các hàm này vẫn đúng với hồ sơ mới, và vẫn cần cho hồ sơ 123456 cũ đang có trong DB.

- [ ] **Step 1: Viết/sửa test thất bại**
  - `MemberProfileServiceTest`: đổi `createsMinimalAccountWithDefaultPasswordAndDevicePermissions` thành `createsDoorOnlyProfileWithUnusablePassword`. Kiểm tra `account.getPhone()` là null; `account.getEmail()` khớp `profile-[0-9a-f-]{36}@noapp\.local`; `passwords.matches("123456", hash)` là **false**; `hash` khác null; quyền thành viên và audit `CREATE_MEMBER_PROFILE` (`unitId`, `room`) như cũ. Gọi `create` hai lần phải ra hai email khác nhau.
  - Xóa các test về contact: `createsWithLowercasedEmailContact`, `existingPhoneIs409`, `existingEmailIs409`, `invalidContactIs400`. Thêm `blankOrTooLongNameIs400` (`""`, `"   "`, 101 ký tự) và `tooLongRoomIs400` (51 ký tự); cả hai `verifyNoInteractions(memberships, audits)`.
  - `ManagerServiceTest`: sửa constructor `new CreateMemberProfileRequest("Bé Na", "P302")`. Thêm `createsMemberProfileEvenWithInvitationFlow`: dựng `ManagerService` có `InvitationService` khác null → không còn 410 mà trả response. Thêm `searchSkipsDoorOnlyProfiles`: `accounts.findById(2L)` trả tài khoản email `profile-x@noapp.local` → `searchUsers(1L, "2", "account")` rỗng. Thêm `doorOnlyProfileHidesPlaceholderEmail`: `getUsers` với thành viên email `profile-x@noapp.local` → `response.email()` là null.
  - `ManagerControllerTest`: `createMemberProfileReturns201` gửi `{"fullName":"Bé Na","room":"P302"}` và verify `new CreateMemberProfileRequest("Bé Na","P302")`; đổi `createMemberProfileRequiresNameAndContact` thành `createMemberProfileRequiresName` (`{"fullName":""}` → 400).

- [ ] **Step 2: Chạy test, phải FAIL**

Run: `cd smart-access-control-backend && mvn test -Dtest="MemberProfileServiceTest,ManagerServiceTest,ManagerControllerTest"`
Expected: lỗi biên dịch vì `CreateMemberProfileRequest` vẫn có 3 tham số.

- [ ] **Step 3: Cài đặt**
  - `create`: bỏ toàn bộ nhánh contact. Đặt `email = "profile-" + UUID.randomUUID() + NO_APP_DOMAIN`, `passwordHash = passwords.encode(<32 byte SecureRandom dạng Base64>)`. Không lưu mật khẩu này ở đâu và không trả về. Xóa `DEFAULT_PASSWORD` và `contactTaken()`.
  - `ManagerService.createMemberProfile`: bỏ dòng `throw ... GONE`. Sửa Javadoc thành "Thêm người chưa có tài khoản: hồ sơ chỉ dùng tại cửa, không đăng nhập được".
  - `searchUsers`: `.filter(a -> !MemberProfileService.isDoorOnly(a))` trước `map`.
  - `UnitUserResponse.from(access, room, hasLoggedIn, deletable)`: `email = isDoorOnly(account) ? null : account.getEmail()`.

- [ ] **Step 4: Chạy toàn bộ test, phải PASS**

Run: `cd smart-access-control-backend && mvn test`
Expected: `BUILD SUCCESS`.

- [ ] **Step 5: Commit (người dùng tự chạy)**

```bash
git add smart-access-control-backend/src
git commit -m "feat(members): door-only profiles without shared default password"
```

---

### Task 4: Mobile — form "Chưa có ứng dụng"

**Files:**
- Create: `IOT_mobile/src/utils/memberProfileInput.ts`
- Create: `IOT_mobile/src/components/NewPersonMember.tsx`
- Modify: `IOT_mobile/src/services/api/managerService.ts` (thêm `createMemberProfile`)
- Modify: `IOT_mobile/app/index.tsx` — `ViewName` (~dòng 60), nhánh `view === 'add-member'` (~dòng 309, thay `Alert.alert`), `AddMemberChoice` (~dòng 1063, bỏ khung `guide`), `MemberDetail` (~dòng 1306, dòng phụ đề)
- Test: `IOT_mobile/tests/member-profile-input.test.ts`

**Interfaces:**
- Consumes: API của Task 3.
- Produces:
  - `validateMemberProfileInput(input: { fullName: string; room: string }): { ok: true; value: { fullName: string; room?: string } } | { ok: false; message: string }`.
  - `memberContactLabel(p: { hasAccount: boolean; contact: string | null }): string`.
  - `managerService.createMemberProfile(unitId: number, input: { fullName: string; room?: string }): Promise<UnitUserDto>` → `POST /api/manager/units/${unitId}/member-profiles`.
  - `NewPersonMember({ unitId, back, done }: { unitId: number | null; back: () => void; done: (user: UnitUserDto) => Promise<void> })`.

- [ ] **Step 1: Viết test thất bại** `tests/member-profile-input.test.ts` (`node:test` + `assert`, theo kiểu `member-credentials.test.ts`):
  - `"  Bé Na  "`, room `" P302 "` → `{ ok: true, value: { fullName: "Bé Na", room: "P302" } }`.
  - room `"   "` → `value.room` là `undefined`.
  - fullName `""` hoặc `"   "` → `{ ok: false, message: "Vui lòng nhập họ và tên." }`.
  - fullName 101 ký tự → `message: "Họ và tên tối đa 100 ký tự."`; room 51 ký tự → `message: "Phòng tối đa 50 ký tự."`.
  - `memberContactLabel({ hasAccount: true, contact: "a@b.vn" })` → `"Có tài khoản ứng dụng"`; `({ hasAccount: false, contact: null })` → `"Chỉ dùng tại cửa · vân tay, thẻ"`; `({ hasAccount: false, contact: "0912000111" })` → `"Chưa đăng nhập ứng dụng · 0912000111"` (hồ sơ 123456 cũ).

- [ ] **Step 2: Chạy test, phải FAIL**

Run: `cd IOT_mobile && npm test`
Expected: FAIL `Cannot find module '../src/utils/memberProfileInput'`.

- [ ] **Step 3: Cài đặt**
  - `memberProfileInput.ts`: hai hàm theo đúng các giá trị ở Step 1.
  - `NewPersonMember.tsx`: `PageHeader title="Người chưa có ứng dụng"`; `Notice` có nội dung: `Tạo hồ sơ chỉ dùng tại cửa. Người này không đăng nhập ứng dụng; sau khi tạo, bạn thêm vân tay hoặc gán thẻ cho họ.`; hai `Input`: "Họ và tên" (placeholder `Nguyễn Văn A`) và "Phòng (không bắt buộc)" (placeholder `P302`); `Button` có nhãn `Tạo hồ sơ và thêm vào cửa`, khi đang gửi thì nhãn là `Đang tạo…` và nút bị khóa. Lỗi từ API hiện bằng `Notice tone="error"` qua `errorText(e, 'Không tạo được hồ sơ. Vui lòng thử lại.')`; nếu `errorText` chưa được export thì chuyển nó sang `src/utils`. Thành công thì gọi `done(user)`.
  - `index.tsx`: thêm `'new-person-member'` vào `ViewName`; `choosePerson={() => setView('new-person-member')}`; nhánh render mới: `done` tải lại `load()` và `loadMembers(selected)`, `setSelectedPerson(toPerson(user))`, rồi `setView('member-detail')`. Trong `AddMemberChoice`, dùng prop `choosePerson` cho thẻ "Chưa có ứng dụng" và bỏ state `guide` cùng `Notice` hướng dẫn tự đăng ký. Trong `MemberDetail`, thay biểu thức phụ đề bằng `memberContactLabel(person)`.

- [ ] **Step 4: Chạy test, phải PASS**

Run: `cd IOT_mobile && npm run typecheck && npm test && npm run lint`
Expected: không lỗi TS, mọi test xanh, lint không có error.

- [ ] **Step 5: Kiểm tra trên app thật** (thiết bị đã kích hoạt, backend đã chạy Task 3):
  1. Cửa → Thành viên → Thêm → "Chưa có ứng dụng" → nhập `Bé Na`, `P302` → mở màn chi tiết, có dòng "Chỉ dùng tại cửa · vân tay, thẻ" và "Phòng P302".
  2. Thêm vân tay cho Bé Na → chạm vân tay → cửa mở, lịch sử ghi tên Bé Na.
  3. Xóa vân tay rồi xóa Bé Na khỏi cửa → hồ sơ bị xóa (chưa có lịch sử) hoặc bị ẩn (đã có lịch sử).
  4. Nhập sai PIN 5 lần trên màn cửa → trong ≤ 30 s app hiện thông báo CRITICAL "nhập sai PIN 5 lần…". Chạm 5 ngón tay lạ hoặc quẹt 5 thẻ lạ trong 2 phút → có thông báo "xác thực sai…". Bấm "Đã xử lý" → không có cảnh báo mới cho tới khi sai thêm 5 lần.

- [ ] **Step 6: Commit (người dùng tự chạy)**

```bash
git add IOT_mobile/src IOT_mobile/app/index.tsx IOT_mobile/tests/member-profile-input.test.ts
git commit -m "feat(mobile): add door-only member profile form"
```

---

### Task 5: Cập nhật tài liệu nghiệp vụ

**Files:**
- Modify: `docs/FLOW_HE_THONG.md:122` — thêm câu: "Người chưa có ứng dụng: chủ cửa tạo hồ sơ chỉ dùng tại cửa (họ tên, phòng), không có mật khẩu dùng được; người đó chỉ dùng vân tay/thẻ."
- Modify: `docs/CHU_CUA_VA_XOA_THANH_VIEN.md` — mục xóa thành viên: hồ sơ tại cửa được xóa hẳn hoặc ẩn khi gỡ khỏi cửa (theo `MemberProfileService.dispose`).
- Modify: mục cảnh báo trong `docs/TONG_QUAN_KY_THUAT.md` (hoặc file đang liệt kê `DEVICE_OFFLINE`, tìm bằng `grep -rn DEVICE_OFFLINE docs`) — thay `REPEATED_DENIED` bằng hai quy tắc mới, ghi đúng ngưỡng 5 lần/5 phút và 5 lần/2 phút, và ghi rằng cần firmware ≥ 1.9.0 thì mới có lượt PIN sai và vân tay lạ.

- [ ] **Step 1: Sửa ba tài liệu như trên.**
- [ ] **Step 2: Kiểm tra** `grep -rn "REPEATED_DENIED\|123456" docs/*.md` chỉ còn các chỗ nói về lịch sử hoặc dữ liệu cũ.
- [ ] **Step 3: Commit (người dùng tự chạy)**

```bash
git add docs
git commit -m "docs: describe wrong-attempt alerts and door-only member profiles"
```
