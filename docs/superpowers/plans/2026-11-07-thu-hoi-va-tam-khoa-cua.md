# Thu hồi thiết bị và tạm khóa cửa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thiết bị bị thu hồi thì chip ngừng hẳn (kể cả khi rút điện cắm lại). SUSPENDED thì chip từ chối mọi lượt mở. Chủ cửa được tạm khóa cửa từ app.

**Architecture:** Backend gửi trạng thái xuống chip theo hai đường: lệnh trên topic `cmd` (`DEVICE_DECOMMISSION`, `DOOR_LOCKDOWN`, `DOOR_RELEASE`) và trường mới trong bản tin `config` trả lời heartbeat (`lifecycle`, `lockdown`, `ownerRfid`, `ownerFingerprints`). Chip lưu trạng thái hạn chế vào NVS. Một header thuần `door_restriction.h` quyết định lượt mở nào được qua. Không có cột mới: trạng thái tạm khóa trên server suy ra từ command `DOOR_LOCKDOWN`/`DOOR_RELEASE` gần nhất đã ACK, thuộc generation hiện tại.

**Tech Stack:** Spring Boot + JPA + JUnit/Mockito (backend), ESP32-S3 Arduino/PlatformIO + test Python biên dịch C++ trên máy (firmware), Expo/React Native + `node --test` (mobile).

**Spec:** Quyết định của người dùng ngày 2026-11-07 trong hội thoại (không có file spec riêng):
- Thu hồi theo cách A. Chip xóa PIN, thẻ, vân tay, Wi-Fi và secret; giữ chốt ở vị trí khóa; màn hình báo "Thiết bị đã thu hồi". Cắm điện lại cũng không dùng được.
- SUSPENDED: chip từ chối mọi lượt mở và giữ dữ liệu; ACTIVE lại thì dùng tiếp. MAINTENANCE vẫn mở bình thường.
- Tạm khóa của chủ cửa:
  - không tự hết hạn;
  - chủ cửa vẫn mở được bằng vân tay hoặc thẻ của mình;
  - chủ nhà vẫn mở được bằng **PIN quản trị** nhập trên bàn phím TFT. PIN thường dùng chung bị chặn. (Người dùng làm rõ ngày 2026-11-07: "nút bên trong" chính là bàn phím để chủ nhà nhập PIN. Firmware chỉ có một bàn phím TFT cảm ứng.);
  - vẫn đồng bộ quyền.
- Thứ tự ưu tiên: DECOMMISSIONED > SUSPENDED > Lockdown > MAINTENANCE > ACTIVE.
- Chặn `MemberRemovalService.start` khi cửa không ACTIVE.

## Global Constraints

- Không thêm cột, không migration mới, không sửa entity/schema. Chỉ được thêm dữ liệu, ví dụ giá trị `command_type` mới.
- Không chạy git commit/push/pull/tag. Các bước "Commit" dưới đây là lệnh gợi ý để người dùng tự chạy.
- Giao thức firmware chỉ được **thêm** trường. Chip cũ bỏ qua trường lạ; backend phải chịu được chip cũ không gửi ACK cho lệnh mới.
- Bản build offline (`platformio.offline.ini`, không có `CONNECTED_DOOR`) không đổi hành vi. Mọi code mới trong `offline_door.ino` nằm trong `#ifdef CONNECTED_DOOR`.
- Chữ hiển thị trên app và thông báo lỗi backend bằng tiếng Việt. Chữ trên màn hình chip giữ tiếng Anh không dấu như hiện tại.
- Hằng số loại lệnh: `DEVICE_DECOMMISSION`, `DOOR_LOCKDOWN`, `DOOR_RELEASE`.
- Endpoint:
  - `GET /api/manager/units/{unitId}/lockdown` trả về `{"lockedDown": boolean}`;
  - `POST /api/manager/units/{unitId}/lockdown` trả về 202 kèm `CommandResponse`;
  - `DELETE /api/manager/units/{unitId}/lockdown` trả về 202 kèm `CommandResponse`.
- Firmware `FIRMWARE_VERSION "1.10.0"`.

## Review Focus

1. **Chip offline lúc admin thu hồi, vài ngày sau mới cắm lại:** bản tin đầu tiên của nó bị từ chối, và backend phải gửi `DEVICE_DECOMMISSION` (Task 3 có test).
2. **Mất điện giữa lúc chip đang xóa:** cờ thu hồi đã ghi trước, nên lần khởi động sau phải xóa tiếp rồi mới hiện màn hình thu hồi (Task 6 có test nguồn).
3. **Cửa đang tạm khóa rồi reset hoặc chuyển giao cho chủ mới:** chủ mới không bị kẹt ở trạng thái khóa. Server so generation (Task 1 có test); chip xóa `nvs` khi reset.
4. **Chủ cửa bấm khóa hai lần, hoặc bấm khóa khi lệnh mở khóa chưa ACK:** backend trả 409, không tạo hai lệnh chồng nhau (Task 1 có test).
5. **Thành viên có quyền mở từ xa bấm "Mở cửa" khi đang tạm khóa:** bị từ chối với thông báo rõ ràng, còn chủ cửa vẫn mở được (Task 2 có test).

---

### Task 1: LockdownService và endpoint cho chủ cửa

**Files:**
- Create: `smart-access-control-backend/src/main/java/com/smartaccess/service/LockdownService.java`
- Modify: `smart-access-control-backend/src/main/java/com/smartaccess/repository/CommandRepository.java`
- Modify: `smart-access-control-backend/src/main/java/com/smartaccess/controller/ManagerCommandController.java`
- Test: `smart-access-control-backend/src/test/java/com/smartaccess/service/LockdownServiceTest.java`
- Test: `smart-access-control-backend/src/test/java/com/smartaccess/controller/ManagerCommandControllerTest.java`

**Interfaces:**
- Produces:
  - `LockdownService.DOOR_LOCKDOWN = "DOOR_LOCKDOWN"` and `LockdownService.DOOR_RELEASE = "DOOR_RELEASE"`.
  - `CommandResponse start(Long managerId, Long unitId)` and `CommandResponse release(Long managerId, Long unitId)`.
  - `boolean isLockedDown(Device device)` and `boolean isLockedDown(Long unitId)`. The second returns false when the unit has no door controller.
- Repository: `Optional<Command> findFirstByDevice_DeviceIdAndCommandTypeInAndStatusOrderByCommandIdDesc(Long deviceId, Collection<String> types, CommandStatus status)`.

- [ ] **Step 1: Write the failing tests** in `LockdownServiceTest` (Mockito, same style as `AlertRuleServiceTest`):
  - `ownerStartsLockdownOnOnlineDoor`: `guard.requireManagedUnit(7L, 3L)` passes and `guard.requireOnlineController(3L)` returns a device whose inventory generation is 4.
    - Expect `dispatcher.dispatch(device, 7L, "DOOR_LOCKDOWN", payload, Map.of())`.
    - The payload must equal `Map.of("unitId", 3L, "generation", 4L)`.
  - `memberCannotStartLockdown`: `requireManagedUnit` throws `BusinessException(FORBIDDEN)`. Expect the exception and no dispatch.
  - `pendingLockdownCommandIsConflict`: `commands.existsByDevice_DeviceIdAndCommandTypeAndStatusIn` returns true for `DOOR_RELEASE` with PENDING/SENT. Expect `BusinessException` with `HttpStatus.CONFLICT` and the message "Cửa đang xử lý lệnh khóa trước đó".
  - `lockedWhenLatestAckedIsLockdownOfCurrentGeneration`: latest ACKNOWLEDGED command is `DOOR_LOCKDOWN` with payload generation 4, and the inventory generation is 4. Expect `isLockedDown(device)` to be true.
  - `notLockedAfterRelease`: latest is `DOOR_RELEASE`. Expect false.
  - `notLockedAfterResetToNewGeneration`: latest is `DOOR_LOCKDOWN` with generation 4, inventory generation is 5. Expect false.
  - `notLockedWithoutAnyCommand`: the repository returns `Optional.empty()`. Expect false.

- [ ] **Step 2: Run and watch them fail**
  Run: `cd smart-access-control-backend && mvn -B -q test -Dtest=LockdownServiceTest`
  Expected: compile FAIL, "cannot find symbol LockdownService".

- [ ] **Step 3: Implement `LockdownService`**
  - Dependencies: `ManagerAccessGuard`, `DeviceCommandService`, `CommandRepository`, `DeviceInventoryRepository`, `DeviceRepository`.
  - `start`/`release` order: `requireManagedUnit`, then `requireOnlineController`, then reject a pending lockdown or release command with 409, then `dispatch`. Generation comes from `inventory.findById(deviceId)`; use `0L` when absent.
  - Add the repository method to `CommandRepository`.
  - Record `Ruling` if `dispatch` must be called inside `@Transactional`: it is `MANDATORY`, so annotate both methods `@Transactional`.

- [ ] **Step 4: Run the tests**
  Run: `mvn -B -q test -Dtest=LockdownServiceTest`
  Expected: PASS.

- [ ] **Step 5: Add the controller endpoints and their test**
  - Add the three endpoints from Global Constraints to `ManagerCommandController`. The GET returns `Map.of("lockedDown", lockdownService.isLockedDown(unitId))` after `guard.requireManagedUnit`. Put this read in a service method `Map<String, Boolean> status(Long managerId, Long unitId)` so the controller does not touch the guard.
  - In `ManagerCommandControllerTest`, add `lockdownEndpointsReturnAccepted`, following the existing pattern for `/lock`. POST and DELETE must return 202 and call `start` and `release`.

- [ ] **Step 6: Run**
  Run: `mvn -B -q test -Dtest=LockdownServiceTest,ManagerCommandControllerTest`
  Expected: PASS.

- [ ] **Step 7: Commit (người dùng tự chạy)**
  `git add smart-access-control-backend && git commit -m "feat: owner lockdown commands"`

---

### Task 2: Snapshot gửi chip và chặn mở từ xa hoặc khuôn mặt khi đang khóa

**Files:**
- Modify: `smart-access-control-backend/src/main/java/com/smartaccess/service/LocalAccessPolicyService.java`
- Modify: `smart-access-control-backend/src/main/java/com/smartaccess/service/RemoteUnlockService.java`
- Modify: `smart-access-control-backend/src/main/java/com/smartaccess/service/FaceRecognitionService.java`, around line 91, before `dispatchWithUuid(... DOOR_UNLOCK ...)`
- Test: `smart-access-control-backend/src/test/java/com/smartaccess/service/LocalAccessPolicyServiceTest.java`
- Test: `smart-access-control-backend/src/test/java/com/smartaccess/service/RemoteUnlockServiceTest.java` (create)

**Interfaces:**
- Consumes: `LockdownService.isLockedDown(Device)` from Task 1.
- Produces: `snapshot(uid)` gains three keys:
  - `"lockdown"`: Boolean;
  - `"ownerRfid"`: `List<String>`, a subset of `"rfid"` limited to cards owned by `unit.getManager()`;
  - `"ownerFingerprints"`: `List<Integer>`, a subset of `"fingerprints"`.
  
  `Map.of` stays within 10 pairs (9 after the change).

- [ ] **Step 1: Write the failing tests**
  - `LocalAccessPolicyServiceTest.snapshotMarksOwnerCredentialsAndLockdown`:
    - Setup: unit manager is account 1 with card `"A1B2C3D4"` and finger 5; member account 2 has card `"11223344"` and finger 6; lockdown is mocked true.
    - Expect `ownerRfid == ["A1B2C3D4"]`, `ownerFingerprints == [5]`, `lockdown == true`.
    - Expect `rfid` and `fingerprints` to still contain both owners' entries.
  - `RemoteUnlockServiceTest.memberUnlockRejectedDuringLockdown`: account 2 is a member with `allowRemoteUnlock`, and lockdown is true. Expect `BusinessException(CONFLICT, "Cửa đang tạm khóa; chỉ chủ cửa mở được")` and no dispatch.
  - `RemoteUnlockServiceTest.ownerUnlocksDuringLockdown`: account 1 is the manager. Expect a `DOOR_UNLOCK` dispatch.
  - `RemoteUnlockServiceTest.memberCanStillLockDuringLockdown`: `lock()` by a member dispatches `DOOR_LOCK`. Locking is always allowed.

- [ ] **Step 2: Run them and confirm they fail**
  Run: `mvn -B -q test -Dtest=LocalAccessPolicyServiceTest,RemoteUnlockServiceTest`
  Expected: FAIL on the missing keys and on the missing exception.

- [ ] **Step 3: Implement**
  - Inject `LockdownService` into both services.
  - In `FaceRecognitionService`, when lockdown is on and the recognised account is not `unit.getManager()`, take the method's existing deny path with reason code `LOCKDOWN` and do not dispatch.
  - Add `"LOCKDOWN"` to `AlertRuleService.IGNORED_REASONS`. A refusal because of lockdown is not a failed authentication.
  - Add one assertion to `AlertRuleServiceTest` that a `LOCKDOWN` denial is not counted.

- [ ] **Step 4: Run the tests**
  Run: `mvn -B -q test -Dtest=LocalAccessPolicyServiceTest,RemoteUnlockServiceTest,AlertRuleServiceTest`
  Expected: PASS.

- [ ] **Step 5: Commit (người dùng tự chạy)**
  `git commit -am "feat: lockdown in device snapshot and remote/face unlock"`

---

### Task 3: Backend báo trạng thái vòng đời xuống chip

**Files:**
- Create: `smart-access-control-backend/src/main/java/com/smartaccess/service/DecommissionNotifier.java`
- Modify: `smart-access-control-backend/src/main/java/com/smartaccess/service/DeviceAuthenticationService.java`
- Modify: `smart-access-control-backend/src/main/java/com/smartaccess/service/MqttDeviceGateway.java`, in `handle()`
- Modify: `smart-access-control-backend/src/main/java/com/smartaccess/controller/AdminDeviceController.java`, in `lifecycle()`
- Test: `MqttDeviceGatewayTest.java`, `DeviceAuthenticationServiceTest.java`, `AdminDeviceControllerTest.java`

**Interfaces:**
- Produces:
  - `DecommissionNotifier.COMMAND = "DEVICE_DECOMMISSION"`.
  - `void notifyNow(String deviceUid)` sends immediately through `DeviceGateway.send(uid, randomUuid, COMMAND, Map.of())`. It swallows `RuntimeException`, because the chip being offline is not an error.
  - `void onRejected(String deviceUid)`: if the device exists and is DECOMMISSIONED, call `notifyNow`, at most once every 60 s per uid. Keep the timestamps in an in-memory `ConcurrentHashMap`.
  - `Device DeviceAuthenticationService.authenticateSuspended(String uid, String secret)` accepts only SUSPENDED devices with the correct secret, and throws `invalid()` otherwise.
- Wire protocol: every `config` reply gains `"lifecycle": "<DeviceLifecycleStatus>"`. A SUSPENDED device's heartbeat gets a minimal config: `{requestId, serverTime, generation, lifecycle:"SUSPENDED"}`. Its `generation` comes from `deployment.generation(uid)`.
- Decision: `DEVICE_DECOMMISSION` creates no `commands` row. The ACK from a chip with no secret can never be authenticated, so a row would only hit TIMEOUT. The audit `DEVICE_DECOMMISSIONED` already exists.

- [ ] **Step 1: Write the failing tests**
  - `DeviceAuthenticationServiceTest`:
    - `suspendedDeviceAuthenticatesForStatusOnly`: `authenticateSuspended` returns the device.
    - `activeDeviceRejectedBySuspendedPath`: it throws.
  - `MqttDeviceGatewayTest`, following the file's existing pattern for building a gateway with mocks:
    - `configReplyCarriesLifecycle`: a status message from an ACTIVE device produces a published `config` containing `"lifecycle":"ACTIVE"`.
    - `suspendedHeartbeatGetsMinimalConfig`: `authenticate` throws and `authenticateSuspended` returns the device. Expect `config` with `"lifecycle":"SUSPENDED"` and no `rfid` key. Expect `telemetry.record` never called.
    - `rejectedMessageNotifiesDecommission`: `authenticate` throws and the uid is DECOMMISSIONED. Expect `notifier.onRejected(uid)` to be called once.
  - `AdminDeviceControllerTest.decommissionNotifiesDevice`: PATCH with status DECOMMISSIONED leads to `notifier.notifyNow(uid)` and a null secret hash.
  - `DecommissionNotifierTest` (create):
    - `rateLimitsPerDevice`: two `onRejected` calls within 60 s result in one `send`.
    - `ignoresNonDecommissioned`: an ACTIVE uid results in no `send`.

- [ ] **Step 2: Run them and confirm they fail**
  Run: `mvn -B -q test -Dtest=MqttDeviceGatewayTest,DeviceAuthenticationServiceTest,AdminDeviceControllerTest,DecommissionNotifierTest`
  Expected: compile FAIL, "DecommissionNotifier".

- [ ] **Step 3: Implement**
  - In `handle()`, wrap `authentication.authenticate(...)` in its own `try`.
  - On `ResponseStatusException`:
    - if `kind` is `"status"`, try `authenticateSuspended` and reply with the minimal config, then `return`;
    - otherwise call `notifier.onRejected(deviceUid)` and `return`.
  - In `AdminDeviceController`, call `notifyNow` through `TransactionSynchronizationManager.registerSynchronization(afterCommit)` so the chip is only told after the DB commit.

- [ ] **Step 4: Run all backend tests**
  Run: `mvn -B -q test`
  Expected: PASS, the whole suite.

- [ ] **Step 5: Commit (người dùng tự chạy)**
  `git commit -am "feat: tell controllers their lifecycle and decommission"`

---

### Task 4: Chặn xóa thành viên khi cửa không ACTIVE

**Files:**
- Modify: `smart-access-control-backend/src/main/java/com/smartaccess/service/MemberRemovalService.java`, in `start()`, right after `findByDeviceUidForUpdate`
- Test: `smart-access-control-backend/src/test/java/com/smartaccess/service/MemberRemovalServiceTest.java` (create)

- [ ] **Step 1: Write the failing test** `startRejectedWhenControllerNotActive`, parameterised over MAINTENANCE, SUSPENDED and DECOMMISSIONED.
  - Expect `BusinessException(CONFLICT, "Cửa đang bảo trì hoặc tạm ngưng; chưa xóa thành viên được")`.
  - Expect `dispatcher` never called.
  - Expect the membership flags unchanged (`allowRfid` still true).
- [ ] **Step 2: Run and confirm it fails**
  Run: `mvn -B -q test -Dtest=MemberRemovalServiceTest`
  Expected: FAIL, no exception thrown.
- [ ] **Step 3: Implement** `if (d.getLifecycleStatus() != DeviceLifecycleStatus.ACTIVE) throw ...` before any credential changes.
- [ ] **Step 4: Run**
  Run: `mvn -B -q test`
  Expected: PASS.
- [ ] **Step 5: Commit (người dùng tự chạy)**
  `git commit -am "fix: block member removal on inactive controller"`

---

### Task 5: Header `door_restriction.h` (logic thuần, test trên máy)

**Files:**
- Create: `firmware/include/door_restriction.h`
- Test: `firmware/tests/test_door_restriction.py` (create, same style as `test_door_timing.py`: write C++ source, compile with `g++`, run)
- Modify: `.github/workflows/ci.yml`, step "Host firmware state tests": append `&& python firmware/tests/test_door_restriction.py`

**Interfaces:**
- Produces, in `namespace DoorRestriction`:
  - `enum Mode : uint8_t { NORMAL=0, LOCKDOWN=1, SUSPENDED=2, RETIRED=3 };`
  - `inline bool allowLocal(Mode mode, bool ownerCredential)`:
    - NORMAL: true.
    - LOCKDOWN: `ownerCredential`. Admin PIN passes `true`, user PIN passes `false`.
    - SUSPENDED and RETIRED: false.
  - `inline bool allowRemote(Mode mode)`: true for NORMAL and LOCKDOWN. The backend already filters by account.
  - `inline Mode fromServer(Mode current, const char *lifecycle, bool lockdown)`:
    - RETIRED never changes;
    - `"SUSPENDED"` gives SUSPENDED;
    - `"ACTIVE"` gives `lockdown ? LOCKDOWN : NORMAL`;
    - `nullptr` (old backend) gives `lockdown ? LOCKDOWN : NORMAL`, except that SUSPENDED is kept;
    - any other string keeps `current`.
  - `inline Mode decode(uint8_t raw)`: values above 3 give NORMAL.

- [ ] **Step 1: Write the failing test.** Assertions in C++:
  - `allowLocal(LOCKDOWN,true)` and `!allowLocal(LOCKDOWN,false)`;
  - `!allowLocal(SUSPENDED,true)` and `!allowLocal(RETIRED,true)`;
  - `fromServer(SUSPENDED,"ACTIVE",false)==NORMAL`;
  - `fromServer(NORMAL,"SUSPENDED",true)==SUSPENDED`;
  - `fromServer(RETIRED,"ACTIVE",false)==RETIRED`;
  - `fromServer(LOCKDOWN,"MAINTENANCE",false)==LOCKDOWN`;
  - `fromServer(NORMAL,nullptr,true)==LOCKDOWN`;
  - `decode(9)==NORMAL`.
- [ ] **Step 2: Run and confirm it fails**
  Run: `python firmware/tests/test_door_restriction.py`
  Expected: FAIL, "door_restriction.h: No such file".
- [ ] **Step 3: Implement the header.**
- [ ] **Step 4: Run**
  Run: `python firmware/tests/test_door_restriction.py`
  Expected: exit 0.
- [ ] **Step 5: Commit (người dùng tự chạy)**
  `git add firmware .github && git commit -m "feat: door restriction state logic"`

---

### Task 6: Firmware áp dụng thu hồi, tạm ngưng và tạm khóa

**Files:**
- Modify: `firmware/connected_door/network.h`
  - config handler around line 447;
  - cmd handler around line 477;
  - `connectedSetup()`;
  - `connectedDrawStatusBar()`.
- Modify: `firmware/offline_door/offline_door.ino`
  - `setup()` (line 1146);
  - RFID HOME branch (line ~822);
  - finger HOME branch (line ~900);
  - PIN HOME success path in `submitPin()`.
- Modify: `firmware/connected_door/main.cpp`: forward declarations and `FIRMWARE_VERSION "1.10.0"`.
- Test: `firmware/tests/test_device_retirement.py` (create; checks the source like `test_failed_attempt_reporting.py`). Append it to the CI "Member credential removal on host" step.

**Interfaces:**
- Consumes: `DoorRestriction::*` from Task 5. Wire keys from Tasks 2 and 3.
- Produces (connected build only), declared in `main.cpp`:
  - `bool connectedRetired()`;
  - `void connectedRetiredBoot()`, which never returns;
  - `bool connectedAllowsCard(const String &uid)`;
  - `bool connectedAllowsFinger(int id)`;
  - `bool connectedAllowsPin(bool adminPin)`;
  - `bool connectedLockdownActive()`;
  - `const char *connectedRestrictionNotice()`, which returns `nullptr` when the mode is NORMAL.
- NVS:
  - New namespace `"doorretire"`, key `"retired"` (bool). **No** reset or clear function touches this namespace.
  - Key `"restrict"` (UChar) in `nvs`. It is cleared automatically on reset, because `executeReset` runs `nvs.clear()`.
  - Owner lists in `nvs` as strings: `"ownerCards"` holds upper-case hex uids joined by commas, `"ownerFingers"` holds ids joined by commas.

- [ ] **Step 1: Write the failing source test.** `test_device_retirement.py` checks:
  - `retire_flag_written_before_wipe`: in the body of `void retireDevice()`, `putBool("retired",true)` comes before `finger.emptyDatabase()`, `nvs.clear()`, `networkPrefs.clear()` and `factoryPrefs.clear()`.
  - `retired_boot_checked_first`: in `setup()`, `connectedRetired()` appears before `loadConfig();` and before `connectedSetup();`, inside `#ifdef CONNECTED_DOOR`.
  - `retired_boot_resumes_wipe`: the body of `connectedRetiredBoot` calls `retireWipe(` and contains no `WiFi.begin`.
  - `decommission_bypasses_generation_and_ttl`: in the cmd handler, `type=="DEVICE_DECOMMISSION"` appears before `GENERATION_MISMATCH`.
  - `local_paths_gated`:
    - the RFID HOME branch contains `connectedAllowsCard(`;
    - the finger HOME branch contains `connectedAllowsFinger(`;
    - the `submitPin` success path contains `connectedAllowsPin(`;
    - all three are inside `#ifdef CONNECTED_DOOR`.
  - `admin_pin_opens_during_lockdown`: on `screen==HOME`, `submitPin` checks `pinMatches(cfg.admin,` under `connectedLockdownActive()`, and that check comes before the wrong-PIN branch `if (!ok)`. So an admin PIN entered during lockdown is never counted as a wrong PIN.
  - `lockdown_commands_handled`: the cmd handler handles `"DOOR_LOCKDOWN"` and `"DOOR_RELEASE"` and acks with `"LOCKDOWN_ON"` and `"LOCKDOWN_OFF"`.
  - `suspended_config_before_claimed`: in the config handler, `doc["lifecycle"]` is read before `claimed=doc["claimed"]`.
  - `firmware_version`: `FIRMWARE_VERSION "1.10.0"`.
- [ ] **Step 2: Run and confirm it fails**
  Run: `python firmware/tests/test_device_retirement.py`
  Expected: AssertionError on the first check.
- [ ] **Step 3: Implement.** Order of work, recorded as decisions:
  - **`retireDevice()`** (cmd `DEVICE_DECOMMISSION`):
    1. Write the retired flag; if writing fails, set `storageFault`.
    2. Write `cfg.lockAngle` to the servo and wait about 600 ms, then `motor.enabled=false` and `servo.detach()`. The servo has no torque afterwards, but the latch stays where it is.
    3. Send `sendAck(uuid,true,"DEVICE_RETIRED",false)` while the network is still up.
    4. Call `retireWipe()`: `finger.emptyDatabase()`, `nvs.clear()`, `eventPrefs.clear()`, `networkPrefs.clear()`, `factoryPrefs.clear()`.
    5. `broker.disconnect()` and `WiFi.disconnect(true,true)`, then `ESP.restart()`.
  - **`connectedRetiredBoot()`**: call `retireWipe()` again (it is idempotent and finishes after a power loss), draw a red screen reading "DEVICE RETIRED" / "Thiet bi da thu hoi", then `for(;;) delay(1000);`. No Wi-Fi, no sensors, no touch.
  - **Config handler**, right after the generation check:
    - if `lifecycle=="SUSPENDED"`, set the mode and `return`;
    - otherwise compute `fromServer(mode, lifecycle|nullptr, doc["lockdown"]|false)`, then save the owner lists. Write to NVS only when the value changed, the same way the existing code avoids rewriting `cfg`.
  - **`DOOR_LOCKDOWN` / `DOOR_RELEASE`**: go through the normal TTL and dedupe path like other commands, set the mode, persist it, and ack.
  - **Local open paths**:
    - Each refusal calls `tell(connectedRestrictionNotice())`.
    - `connectedRecord(...,false,...)` is still called, and the backend ignores reason `LOCKDOWN` (Task 2).
    - `DOOR_UNLOCK` checks `allowRemote(mode)`.
  - **PIN on the keypad during LOCKDOWN** (the "inside button" the user means):
    - On `screen==HOME` in LOCKDOWN, compare the entered digits with `cfg.user` and with `cfg.admin`.
    - An admin PIN match opens the door through `grant("PIN")`. The access log is still `PIN` granted; the backend does not need to know it was the admin PIN.
    - A user PIN match is refused with `tell("Door locked by owner")`. It is not counted as a wrong PIN.
    - Only digits that match neither PIN go to `denyPin()`, which keeps the existing wrong-PIN counter.
    - Outside LOCKDOWN, behaviour is unchanged: the HOME screen only checks `cfg.user`.
  - **Status bar**: show `LOCKED` (yellow) or `SUSPENDED` (red) in place of `ONLINE`/`OFFLINE` while the mode is not NORMAL.
- [ ] **Step 4: Run the firmware tests and the build**
  Run: `python firmware/tests/test_device_retirement.py && python firmware/tests/test_failed_attempt_reporting.py && python firmware/tests/test_offline_door.py && python firmware/tests/test_factory_reset.py && cd firmware && pio run -c platformio.connected.ini && pio run -c platformio.offline.ini`
  Expected: every test exits 0 and both builds report SUCCESS.
- [ ] **Step 5: Commit (người dùng tự chạy)**
  `git add firmware .github && git commit -m "feat: firmware retire, suspend and owner lockdown"`

---

### Task 7: App — nút tạm khóa cho chủ cửa

**Files:**
- Modify: `IOT_mobile/src/services/api/managerService.ts`
- Create: `IOT_mobile/src/utils/lockdown.ts`
- Modify: `IOT_mobile/src/components/DoorDashboard.tsx`, the owner-only settings area next to `toggles`
- Test: `IOT_mobile/tests/lockdown.test.ts` (create)

**Interfaces:**
- Consumes: the three endpoints from Task 1.
- Produces, in `managerService`:
  - `lockdownStatus(unitId: number): Promise<{ lockedDown: boolean }>`;
  - `startLockdown(unitId: number): Promise<CommandDto>`;
  - `endLockdown(unitId: number): Promise<CommandDto>`.
- `lockdown.ts`:
  - `lockdownCopy(lockedDown: boolean): { title: string; button: string; confirm: string }`.
  - Exact strings when `false`:
    - title "Cửa đang hoạt động bình thường";
    - button "Tạm khóa cửa";
    - confirm "Mọi người sẽ không mở được cửa, trừ vân tay, thẻ của bạn và PIN quản trị. Tạm khóa?".
  - Exact strings when `true`:
    - title "Cửa đang tạm khóa";
    - button "Mở khóa cửa";
    - confirm "Thành viên sẽ mở cửa lại được như bình thường. Mở khóa?".

- [ ] **Step 1: Write the failing test.** `lockdown.test.ts` asserts the exact strings for both states.
- [ ] **Step 2: Run and confirm it fails**
  Run: `cd IOT_mobile && node --test tests/lockdown.test.ts`
  Expected: FAIL, module not found. Use the same command form as the existing `npm test`.
- [ ] **Step 3: Implement** the utility, the service calls, and the UI card.
  - The button opens `Alert.alert` with the confirm text.
  - On confirm, call `managerService.waitForCommand(...)`, then reload `lockdownStatus`.
  - Show errors with the existing `setMessage`.
- [ ] **Step 4: Run**
  Run: `npm test && npm run lint`
  Expected: PASS.
  `npm run typecheck` still fails only on `Brand.tsx` (react-native-svg), which is a known, separate failure.
- [ ] **Step 5: Commit (người dùng tự chạy)**
  `git add IOT_mobile && git commit -m "feat: owner lockdown toggle in app"`

---

### Task 8: Tài liệu

**Files:**
- Modify: `docs/TONG_QUAN_KY_THUAT.md`: add rows for "Thu hồi thiết bị", "Tạm ngưng (SUSPENDED)" and "Tạm khóa cửa (chủ cửa)".
- Modify: `docs/FLOW_HE_THONG.md`: add the priority order DECOMMISSIONED > SUSPENDED > Lockdown > MAINTENANCE > ACTIVE.
- Modify: `diagram/ST_VongDoiThietBi.puml`, the file the user is keeping:
  - MAINTENANCE: "Firmware vẫn mở cục bộ".
  - SUSPENDED: "Chip từ chối mọi lượt mở, giữ dữ liệu".
  - DECOMMISSIONED: "Chip xóa sạch, giữ chốt khóa, không khởi động lại được".
  - Add a note about lockdown as a sub-state of ACTIVE.

- [ ] **Step 1:** Update the three files.
- [ ] **Step 2:** Re-read them and check that every endpoint name and command type matches Global Constraints.
- [ ] **Step 3: Commit (người dùng tự chạy)**
  `git add docs diagram && git commit -m "docs: decommission, suspend and lockdown"`
