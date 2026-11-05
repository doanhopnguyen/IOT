# Hoàn thiện các yêu cầu còn thiếu của đề bài — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bổ sung những phần đề bài bắt buộc mà code hiện tại (main @ 4e8b471 + bản sửa review) chưa có: telemetry, quy tắc cảnh báo tự sinh + xác nhận cảnh báo, cấu hình cửa từ xa, biểu đồ/dashboard, xuất dữ liệu, đóng gói triển khai, số đo phi chức năng.

**Architecture:** Backend Spring Boot nhận heartbeat `status` (5 s/lần) qua `MqttDeviceGateway`, lưu telemetry theo kiểu "chỉ khi đổi + giữ nhịp 5 phút" vào bảng `telemetry` có sẵn. Một scheduler đánh giá quy tắc và ghi cảnh báo vào bảng `events` có sẵn. API REST mới cho thống kê/telemetry/cài đặt; mobile vẽ biểu đồ bằng `View` (không thêm thư viện), admin-web có thẻ tổng quan.

**Tech Stack:** Java 17, Spring Boot, JPA/Hibernate, MySQL (H2 trong test), Paho MQTT, Mosquitto, Expo/React Native (TypeScript), admin-web JS thuần, PlatformIO (ESP32-S3), Python 3 (scripts).

**Spec:** `D:\STUDY\IoT\ĐỀ BÀI ĐỒ ÁN KẾT THÚC HỌC PHẦN.pdf` (mục 4.2–4.6, 7, 8.1, 8.4).

## Global Constraints

- Không thêm cột, không migration Flyway mới (quy tắc nhóm): chỉ dùng bảng/cột đã có — `telemetry(metric_name, metric_value, measurement_unit, occurred_at, received_at, message_uuid UNIQUE)`, `events(event_type, severity, alert_status, message)`, `access_units(unlock_duration_sec, door_open_timeout_sec, remote_unlock_enabled, rfid_enabled, fingerprint_enabled)`, `devices(firmware_version, hardware_version)`.
- Giao thức firmware chỉ được **thêm** trường; không đổi/xóa trường cũ của `status`, `cmd`, `ack`, `access`, `config`.
- Heartbeat firmware: 5 s/lần (`network.h:341`); online nếu `last_seen_at` trong 90 s (`ManagerAccessGuard.ONLINE_WINDOW_SEC`).
- Quyền: chỉ chủ cửa (`AccessUnit.manager`) đọc telemetry/thống kê/cảnh báo và đổi cài đặt cửa của mình — dùng `ManagerAccessGuard.requireManagedUnit(managerId, unitId)`; admin dùng `/api/admin/**`.
- Thông báo lỗi/nhãn hiển thị cho người dùng bằng tiếng Việt; tên code bằng tiếng Anh, theo style file xung quanh.
- Không commit bí mật: mọi mật khẩu/secret qua biến môi trường, chỉ có `.env.example`.
- Mỗi task chạy `cd smart-access-control-backend && mvn test` (và `cd IOT_mobile && npm run typecheck` nếu đụng mobile) phải xanh trước khi commit.

## Review Focus

1. **Heartbeat 5 s làm phình bảng telemetry**: 1 thiết bị gửi 17 280 status/ngày; chỉ được ghi khi giá trị đổi (RSSI đổi ≥ 5 dBm) hoặc đã ≥ 300 s từ bản ghi cùng metric. → test `TelemetryServiceTest.unchangedValuesAreNotStoredAgainWithinKeepalive` (Task 1).
2. **Cảnh báo bị nhân bản mỗi lần scheduler chạy**: mỗi (thiết bị, loại cảnh báo) chỉ có tối đa một cảnh báo `OPEN`/`ACKNOWLEDGED`. → test `AlertRuleServiceTest.openAlertIsNotDuplicated` (Task 3).
3. **Chủ cửa A đọc dữ liệu cửa B** (telemetry, thống kê, xuất CSV, cài đặt, xác nhận cảnh báo) phải 403. → test trong Task 2, 3, 4.
4. **Giá trị cài đặt ngoài khoảng** (`unlockDurationSec` 0 hoặc 3600, `doorOpenTimeoutSec` 5) phải 400, không lưu. → test `UnitSettingsServiceTest.outOfRangeValuesAreRejected` (Task 4).
5. **Cửa chưa gắn thiết bị / chưa có dữ liệu**: thống kê và telemetry trả mảng rỗng (7 ngày đủ 7 phần tử 0), không 500. → test `StatsServiceTest.unitWithoutDataReturnsZeroFilledDays` (Task 2).

## Thứ tự ưu tiên (chốt 05/11/2026)

Tiêu chí: cái gì thử được **trên thiết bị thật tối nay** làm trước; cái chỉ là giao diện/đóng gói làm sau.

| Đợt | Task | Lý do |
|---|---|---|
| **0 — trước khi code (tối nay)** | Kiểm tra phần cứng theo `docs/KET_QUA_KIEM_THU.md` mục "Hoàn thành kiểm thử vật lý": dây UART vân tay, nguồn servo, nối cảm biến từ; nạp firmware, đăng ký chip, kích hoạt cửa | Không có thiết bị chạy là Fail; mọi task sau cần thiết bị gửi heartbeat |
| **1 — tối nay** | Task 1 (telemetry + phiên bản firmware) | Thử ngay trên thiết bị: nạp firmware mới, xem bảng `telemetry` có dòng `doorClosed`/`rssi`, `devices.firmware_version` được cập nhật |
| **1 — tối nay** | Task 3, chỉ 2 quy tắc `DEVICE_OFFLINE` và `DOOR_LEFT_OPEN` (+ chống trùng, tự đóng) | Thử bằng rút nguồn thiết bị và để cửa mở; đúng bước demo 7 và 8 |
| **1 — tối nay** | Task 8, chỉ phần đo độ trễ lệnh từ bảng `commands` | Mở cửa từ xa 30 lần trong lúc thử là có số liệu thật cho mục 7.2 |
| 2 — ngày mai | Task 4 (cài đặt cửa từ xa), phần còn lại của Task 3 (`REPEATED_DENIED`, `SENSOR_FAULT`, PATCH xác nhận cảnh báo) | Cần cho demo bước 6 và "xử lý cảnh báo" |
| 3 | Task 2 (API thống kê/telemetry/CSV) → Task 5 (mobile biểu đồ, form, nút cảnh báo) | Task 5 phụ thuộc API của Task 2, 3, 4 |
| 4 | Task 6 (admin dashboard), Task 7 (Docker, README, CI, cấu trúc repo), phần còn lại Task 8 (bảo mật broker, mất mạng, trùng bản tin) | Không cần thiết bị; hoàn thành trước hạn nộp 24/11/2026, rồi gắn tag `v1.0.0` |

---

### Task 1: Ghi telemetry từ heartbeat + phiên bản firmware

**Files:**
- Create: `smart-access-control-backend/src/main/java/com/smartaccess/service/TelemetryService.java`
- Modify: `smart-access-control-backend/src/main/java/com/smartaccess/repository/TelemetryRepository.java`
- Modify: `smart-access-control-backend/src/main/java/com/smartaccess/service/MqttDeviceGateway.java` (case `"status"`)
- Modify: `firmware/connected_door/network.h:342-346` và `firmware/connected_door/main.cpp` (hằng phiên bản)
- Test: `smart-access-control-backend/src/test/java/com/smartaccess/service/TelemetryServiceTest.java`, `MqttDeviceGatewayTest.java`

**Interfaces:**
- Produces: `TelemetryService.record(Device device, JsonNode status, String requestId): void`; hằng `TelemetryService.METRICS = Map.of("doorClosed","bool","unlocked","bool","fingerReady","bool","droppedEvents","count","rssi","dBm","freeHeap","bytes","uptime","s")`; `TelemetryRepository.findFirstByDevice_DeviceIdAndMetricNameOrderByOccurredAtDesc(Long, String): Optional<Telemetry>`; `TelemetryRepository.findByDevice_DeviceIdAndMetricNameAndOccurredAtBetweenOrderByOccurredAt(Long, String, LocalDateTime, LocalDateTime): List<Telemetry>`.

- [ ] **Step 1: Viết test thất bại** `TelemetryServiceTest` (Mockito, như `AccessEventServiceTest`):
  - `storesEachKnownMetricWithUnitOnFirstHeartbeat`: status `{doorClosed:true, unlocked:false, rssi:-61, freeHeap:180000}` → 4 lần `save`, bản ghi `rssi` có `metricValue="-61"`, `measurementUnit="dBm"`, `occurredAt` = giờ server (không lấy giờ thiết bị).
  - `unchangedValuesAreNotStoredAgainWithinKeepalive`: bản ghi cuối `doorClosed="true"` lúc now-60s → status `doorClosed:true` không `save`; lúc now-301s → có `save`.
  - `rssiSmallChangeIsIgnored`: cuối `-61`, mới `-63` → không lưu; mới `-67` → lưu.
  - `nullDoorClosedIsStoredAsUnknown`: `doorClosed:null` → `metricValue="unknown"`.
  - `outOfRangeValuesAreSkipped`: `rssi:20` hoặc `rssi:-200`, `freeHeap:-1` → không lưu metric đó, không throw.
  - `firmwareVersionIsCopiedToDevice`: status `fw:"1.2.0"`, `hw:"esp32s3-n16r8"` → `device.getFirmwareVersion()=="1.2.0"`; chuỗi dài > 50 bị bỏ qua.
  - `messageUuidIsDeterministicPerRequestAndMetric`: cùng `requestId` + metric gọi 2 lần → cùng `messageUuid` (dùng `UUID.nameUUIDFromBytes((requestId+":"+metric).getBytes(UTF_8))`), nên retry không nhân đôi.
- [ ] **Step 2: Chạy** `mvn -q test -Dtest=TelemetryServiceTest` → FAIL (class chưa có).
- [ ] **Step 3: Cài `TelemetryService.record`** (`@Transactional`). Khoảng hợp lệ: `rssi` −120..0, `freeHeap` 0..16 777 216, `uptime` ≥ 0, `droppedEvents` ≥ 0. Keepalive 300 s; ngưỡng RSSI 5 dBm. Thêm 2 method repository ở Interfaces.
- [ ] **Step 4: Nối vào gateway**: trong case `"status"` của `MqttDeviceGateway.handle`, sau `wireConfig`, gọi `telemetry.record(device, body, requestId)` (inject qua constructor; cập nhật constructor trong `MqttDeviceGatewayTest`). Thêm test `MqttDeviceGatewayTest.statusIsRecordedAsTelemetry`: verify `record(door, body, requestId)`.
- [ ] **Step 5: Firmware**: thêm `#define FIRMWARE_VERSION "1.1.0"` trong `main.cpp`; trong status thêm `status["rssi"]=WiFi.RSSI(); status["freeHeap"]=ESP.getFreeHeap(); status["uptime"]=millis()/1000; status["fw"]=FIRMWARE_VERSION; status["hw"]="esp32s3-n16r8";` (tăng `DynamicJsonDocument status(768)` nếu `measureJson` > 700). Build: `cd firmware && pio run -c platformio.connected.ini` → SUCCESS.
- [ ] **Step 6: Chạy** `mvn test` → BUILD SUCCESS.
- [ ] **Step 7: Commit** `feat: store device telemetry from heartbeat and track firmware version`.

### Task 2: API telemetry, thống kê lượt ra vào, xuất CSV

**Files:**
- Create: `smart-access-control-backend/src/main/java/com/smartaccess/service/StatsService.java`, `controller/StatsController.java`, `dto/StatsDtos.java`
- Modify: `repository/AccessLogRepository.java`
- Test: `src/test/java/com/smartaccess/service/StatsServiceTest.java`, `src/test/java/com/smartaccess/controller/StatsControllerTest.java`

**Interfaces:**
- Consumes: `TelemetryRepository.findByDevice_DeviceIdAndMetricNameAndOccurredAtBetweenOrderByOccurredAt` (Task 1); `ManagerAccessGuard.requireManagedUnit`.
- Produces:
  - `GET /api/manager/units/{unitId}/telemetry?metric=rssi&from=&to=` → `List<StatsDtos.Point(LocalDateTime at, String value, String unit)>`; mặc định 24 h gần nhất; tối đa 7 ngày (rộng hơn → 400); `metric` phải thuộc `TelemetryService.METRICS` (khác → 400).
  - `GET /api/manager/units/{unitId}/stats/access?days=7` → `List<StatsDtos.DailyAccess(LocalDate day, long granted, long denied)>`; `days` 1..31; luôn đủ `days` phần tử, ngày không có dữ liệu = 0; múi giờ `Asia/Ho_Chi_Minh`.
  - `GET /api/manager/units/{unitId}/access-logs.csv?from=&to=` → `text/csv; charset=UTF-8`, có BOM UTF-8, header `thoi_gian,phuong_thuc,ket_qua,nguoi_dung,ly_do`, tối đa 10 000 dòng.
  - `AccessLogRepository.countDaily(Long unitId, LocalDateTime from)`: JPQL group theo ngày + result (hoặc lấy danh sách rồi gom trong Java nếu H2 không hỗ trợ hàm ngày giống MySQL — chọn cách chạy được trên cả hai).

- [ ] **Step 1: Test thất bại** `StatsServiceTest`: `unitWithoutDataReturnsZeroFilledDays` (7 phần tử, đều 0, ngày cuối = hôm nay); `countsGrantedAndDeniedPerDay` (2 GRANTED hôm qua, 1 DENIED hôm nay → đúng ngày); `telemetryRangeOver7DaysIs400`; `unknownMetricIs400`; `foreignManagerIs403` (guard ném FORBIDDEN → service không đọc repo).
- [ ] **Step 2:** `mvn -q test -Dtest=StatsServiceTest` → FAIL.
- [ ] **Step 3: Cài** `StatsService` + `StatsController` (`@AuthenticationPrincipal AccountPrincipal`, như `ManagerController`). CSV: escape dấu `"` và `,` theo RFC 4180; cột `nguoi_dung` = `fullName` hoặc rỗng.
- [ ] **Step 4: Test web** `StatsControllerTest` (MockMvc như `ManagerControllerTest`): `anonymousIs401`; `csvHasBomHeaderAndContentType` (byte đầu `EF BB BF`, dòng 1 đúng header).
- [ ] **Step 5:** `mvn test` → BUILD SUCCESS.
- [ ] **Step 6: Commit** `feat: add telemetry query, daily access stats and CSV export for owners`.

### Task 3: Quy tắc cảnh báo tự sinh + xác nhận/xử lý cảnh báo

**Files:**
- Create: `smart-access-control-backend/src/main/java/com/smartaccess/scheduler/AlertRuleScheduler.java`, `service/AlertRuleService.java`
- Modify: `service/AlertService.java`, `controller/AlertController.java`, `repository/EventRepository.java`
- Test: `src/test/java/com/smartaccess/service/AlertRuleServiceTest.java`, `AlertServiceTest` (mới) hoặc bổ sung `ModuleServiceTest`

**Interfaces:**
- Consumes: `TelemetryRepository.findFirstByDevice_DeviceIdAndMetricNameOrderByOccurredAtDesc` (Task 1); `AlertService.record(EventInput)` có sẵn.
- Produces:
  - `AlertRuleService.evaluate(LocalDateTime now): int` (số cảnh báo mới), gọi bởi `AlertRuleScheduler` `@Scheduled(fixedDelay = 30000)`.
  - Quy tắc (event_type / severity / điều kiện):
    - `DEVICE_OFFLINE` / WARNING: `DOOR_CONTROLLER` đã gắn cửa, lifecycle ACTIVE, `last_seen_at` < now − 300 s.
    - `DOOR_LEFT_OPEN` / CRITICAL: bản ghi telemetry `doorClosed` mới nhất = `"false"` và `occurredAt` < now − `access_units.door_open_timeout_sec`.
    - `REPEATED_DENIED` / CRITICAL: ≥ 5 `access_logs` DENIED của cửa trong 120 s gần nhất.
    - `SENSOR_FAULT` / WARNING: telemetry `fingerReady` mới nhất = `"false"`.
  - Chống trùng: `EventRepository.existsByDevice_DeviceIdAndEventTypeAndAlertStatusIn(Long, String, Collection<AlertStatus>)` với `{OPEN, ACKNOWLEDGED}`; `eventUuid` = UUID ngẫu nhiên; `message` tiếng Việt ≤ 255 ký tự.
  - Tự đóng: khi điều kiện hết (thiết bị online lại, cửa đóng, cảm biến sẵn sàng) → cảnh báo OPEN/ACKNOWLEDGED cùng loại chuyển `RESOLVED`.
  - `PATCH /api/alerts/{id}` body `{"status":"ACKNOWLEDGED"|"RESOLVED"}` → `Alert`; chỉ chủ cửa (`requireManager` có sẵn); chỉ cho OPEN→ACKNOWLEDGED, OPEN/ACKNOWLEDGED→RESOLVED (khác → 409); ghi `audit_logs` action `ALERT_<STATUS>`.

- [ ] **Step 1: Test thất bại** `AlertRuleServiceTest`: `offlineControllerRaisesWarningOnce`; `openAlertIsNotDuplicated` (gọi `evaluate` 2 lần → 1 event); `doorLeftOpenUsesUnitTimeout` (timeout 60 s, mở từ 61 s → CRITICAL; 59 s → không); `fiveDeniedInTwoMinutesRaisesCritical` (4 → không, 5 → có); `recoveredConditionResolvesAlert`; `decommissionedOrUnassignedDevicesAreIgnored`.
- [ ] **Step 2:** `mvn -q test -Dtest=AlertRuleServiceTest` → FAIL.
- [ ] **Step 3: Cài** `AlertRuleService` + scheduler (truy vấn theo cửa/thiết bị, không quét toàn bảng access_logs: lọc `occurredAt >= now-120s`).
- [ ] **Step 4: Test + cài PATCH**: `ownerAcknowledgesThenResolves`; `foreignManagerIs403`; `resolvedCannotBeReopenedIs409`.
- [ ] **Step 5:** `mvn test` → BUILD SUCCESS.
- [ ] **Step 6: Commit** `feat: add alert rules (offline, door left open, repeated denied, sensor fault) and alert acknowledgement`.

### Task 4: Cấu hình tham số cửa từ xa

**Files:**
- Create: `smart-access-control-backend/src/main/java/com/smartaccess/service/UnitSettingsService.java`, `dto/unit/UnitSettingsRequest.java`, `dto/unit/UnitSettingsResponse.java`
- Modify: `controller/UnitController.java` (hoặc `ManagerController`), `service/LocalAccessPolicyService.java` (`snapshot`)
- Modify: `firmware/connected_door/network.h` (đọc `doorOpenTimeoutSec` từ `config`, nếu firmware có xử lý cảnh báo cửa mở tại chỗ; nếu không, chỉ backend dùng)
- Test: `src/test/java/com/smartaccess/service/UnitSettingsServiceTest.java`, `LocalAccessPolicyServiceTest.java`

**Interfaces:**
- Produces: `GET`/`PATCH /api/manager/units/{unitId}/settings`; `UnitSettingsRequest(Integer unlockDurationSec, Integer doorOpenTimeoutSec, Boolean remoteUnlockEnabled, Boolean rfidEnabled, Boolean fingerprintEnabled)` — trường null = giữ nguyên; khoảng: `unlockDurationSec` 1..30, `doorOpenTimeoutSec` 10..600; ghi audit `UPDATE_UNIT_SETTINGS` với before/after; `UnitSettingsResponse` cùng 5 trường. `snapshot()` thêm khóa `"doorOpenTimeoutSec"`. Thiết bị nhận cấu hình mới ở lần `status` kế tiếp (≤ 5 s) qua `config` — không cần lệnh mới.

- [ ] **Step 1: Test thất bại**: `outOfRangeValuesAreRejected` (0, 31, 9, 601 → 400, entity không đổi); `partialUpdateKeepsOtherFields`; `foreignManagerIs403`; `auditStoresBeforeAndAfter`; `LocalAccessPolicyServiceTest.snapshotContainsDoorOpenTimeout`; `disablingRfidRemovesCardsFromSnapshot` (đã có logic `unit.isRfidEnabled()` — test xác nhận end-to-end).
- [ ] **Step 2:** chạy test → FAIL.
- [ ] **Step 3: Cài** service + endpoint + khóa snapshot.
- [ ] **Step 4:** `mvn test` → BUILD SUCCESS; nếu sửa firmware: `pio run -c platformio.connected.ini` → SUCCESS.
- [ ] **Step 5: Commit** `feat: let owners change door settings remotely through config sync`.

### Task 5: Mobile — biểu đồ, cài đặt cửa, xử lý cảnh báo

**Files:**
- Create: `IOT_mobile/src/components/DoorDashboard.tsx`, `IOT_mobile/src/components/BarChart.tsx`, `IOT_mobile/src/services/api/statsService.ts`
- Modify: `IOT_mobile/src/components/Alerts.tsx`, `IOT_mobile/src/components/OwnerDeviceSettings.tsx`, `IOT_mobile/app/index.tsx` (mục "Thống kê" trong `Detail` cho chủ cửa)
- Test: `IOT_mobile/src/**/__tests__/statsService.test.ts`, `BarChart.test.tsx` (theo cách test hiện có của app, 19 test đang chạy bằng `npm test`)

**Interfaces:**
- Consumes: API của Task 2, 3, 4.
- Produces: `statsService.dailyAccess(unitId, days)`, `statsService.telemetry(unitId, metric, from?, to?)`, `statsService.settings(unitId)`, `statsService.updateSettings(unitId, patch)`, `alertService.setStatus(id, 'ACKNOWLEDGED'|'RESOLVED')`; `BarChart({ data: {label: string; values: number[]}[]; colors: string[]; max?: number })` vẽ bằng `View` (không thêm thư viện).

- [ ] **Step 1: Test thất bại**: `BarChart` scale cột theo `max` (giá trị lớn nhất = 100% chiều cao, toàn 0 không chia cho 0); `statsService` gọi đúng URL/method/body.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3: Cài**: `DoorDashboard` = biểu đồ 7 ngày (cấp phép xanh / từ chối đỏ) + đường RSSI 24 h (dạng cột nhỏ) + trạng thái hiện tại (online, cửa đóng/mở, firmware); `Alerts` thêm nút "Đã xem" / "Đã xử lý" theo trạng thái; `OwnerDeviceSettings` thêm form 5 trường với kiểm tra khoảng giống backend; nút "Xuất CSV" mở URL Task 2.
- [ ] **Step 4:** `npm test` và `npm run typecheck` → đạt.
- [ ] **Step 5: Commit** `feat(mobile): add door dashboard charts, door settings form and alert actions`.

### Task 6: Admin web — tổng quan hệ thống

**Files:**
- Create: `smart-access-control-backend/src/main/java/com/smartaccess/controller/AdminDashboardController.java`
- Modify: `admin-web/src/app.js`, `admin-web/src/index.html`, `admin-web/src/style.css`
- Test: `src/test/java/com/smartaccess/controller/AdminDashboardControllerTest.java`

**Interfaces:**
- Produces: `GET /api/admin/dashboard` → `{devicesByLifecycle: Map<String,Long>, online: long, offline: long, openAlerts: long, criticalAlerts: long, accessToday: {granted: long, denied: long}}`; online theo cùng cửa sổ 90 s.

- [ ] **Step 1: Test thất bại**: `userIs403`; `countsOnlineByHeartbeatWindow` (1 thiết bị seen 30 s trước, 1 thiết bị 200 s trước → online 1, offline 1).
- [ ] **Step 2:** chạy → FAIL. **Step 3:** cài controller + thẻ tổng quan đầu trang admin (tự làm mới 10 s, như poll hiện có). **Step 4:** `mvn test`; `python scripts/check-web.py` → đạt.
- [ ] **Step 5: Commit** `feat(admin): add system dashboard summary`.

### Task 7: Đóng gói triển khai và cấu trúc repo theo mục 8.1

**Files:**
- Create: `deployment/docker-compose.yml`, `deployment/README.md`, `smart-access-control-backend/Dockerfile`, `.env.example` (gốc), `hardware/README.md` (BOM + bảng chân nối lấy từ `firmware/include`/`platformio.connected.ini`), `tests/README.md` (chỉ tới test backend, mobile, face-node, firmware, scripts), `.github/workflows/ci.yml`
- Modify: `README.md` (viết lại dạng chung, bỏ đường dẫn máy riêng `D:\DEV\IOT`, `C:\Users\ACER`, IP cố định → chuyển phần đó vào `docs/CHAY_DU_AN_LOCAL.md`)

**Interfaces:**
- Produces: `docker compose -f deployment/docker-compose.yml up -d` chạy `mysql:8.4`, `eclipse-mosquitto:2` (mount `infra/mosquitto/mosquitto.conf`, `acl`, file mật khẩu tạo từ biến môi trường bằng entrypoint, không commit), `backend` (build Dockerfile multi-stage `maven:3.9-eclipse-temurin-17` → `eclipse-temurin:17-jre`); biến lấy từ `.env` theo `.env.example`: `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`, `MQTT_BROKER_URL`, `MQTT_USERNAME`, `MQTT_PASSWORD`, `CORS_ALLOWED_ORIGINS`, `SESSION_COOKIE_SECURE`.
- CI: job `backend` (`mvn -B test` trong `smart-access-control-backend`, JDK 17), job `mobile` (`npm ci && npm run typecheck && npm test` trong `IOT_mobile`), job `face-node` (`pip install -r requirements.txt && python -m pytest`).

- [ ] **Step 1:** Viết compose + Dockerfile; chạy `docker compose -f deployment/docker-compose.yml config` → không lỗi; nếu máy có Docker: `up -d` rồi `curl http://localhost:8080/api/health` → 200.
- [ ] **Step 2:** `git grep -nE "ACER|D:\\\\DEV|password=|secret=" -- README.md deployment .env.example` → không có bí mật/đường dẫn máy riêng.
- [ ] **Step 3:** Viết README (giới thiệu, sơ đồ kiến trúc — ảnh hình 1 đã chọn, cách chạy bằng compose, cách nạp firmware, link docs), `hardware/README.md`, `tests/README.md`, CI.
- [ ] **Step 4:** Push nhánh, CI xanh trên GitHub Actions.
- [ ] **Step 5: Commit** `chore: add docker deployment, CI and repository layout required by the brief`.

### Task 8: Kiểm thử phi chức năng và kiểm thử bảo mật broker

**Files:**
- Create: `scripts/measure_nfr.py`, `scripts/broker_security_check.py`, `scripts/tests/test_measure_nfr.py`
- Modify: `docs/KET_QUA_KIEM_THU.md` (thêm mục "Chỉ tiêu phi chức năng" và "Kiểm thử bảo mật broker")

**Interfaces:**
- Produces:
  - `measure_nfr.py --db-url ... --since 2026-11-20T00:00 [--unit-id N]` → in Markdown: (1) độ trễ lệnh = `acknowledged_at - requested_at` của `commands` ACKNOWLEDGED theo `command_type`: n, trung bình, p50, p95, max (ms); (2) tỷ lệ lệnh TIMEOUT/FAILED; (3) tỷ lệ mất heartbeat = 1 − (số `status` telemetry/keepalive kỳ vọng) — hoặc dựa trên khoảng trống `last_seen` từ telemetry `uptime`; (4) thời gian phát hiện offline = `DEVICE_OFFLINE.occurred_at` − telemetry cuối của thiết bị; (5) số `access_uuid` trùng bị bỏ qua (đếm từ log hoặc gửi lại thử).
  - `broker_security_check.py --host --port --device-a-user/pass --device-b-user/pass` → PASS/FAIL cho: A subscribe `smartdoor-iot/<B>/cmd` không nhận được tin; A publish `smartdoor-iot/<B>/status` bị chặn (backend không thấy B online); kết nối ẩn danh bị từ chối; thiết bị đã `DECOMMISSIONED` (secret bị xóa) gửi `status` → backend không cập nhật `last_seen_at`.
- [ ] **Step 1: Test thất bại** `test_measure_nfr.py`: hàm `percentile([..], 95)` và `summarize(rows)` với dữ liệu mẫu cố định (p95 của 1..100 = 95).
- [ ] **Step 2:** `python -m pytest scripts/tests/test_measure_nfr.py` → FAIL. **Step 3:** cài. **Step 4:** pass.
- [ ] **Step 5:** Khi phần cứng chạy: thực hiện 30 lần mở cửa từ xa, rút mạng 60 s, gửi lại 1 sự kiện access trùng; chạy 2 script, dán kết quả + nhận xét vào `docs/KET_QUA_KIEM_THU.md`.
- [ ] **Step 6: Commit** `test: add non-functional measurement and broker security scripts with results`.

### Kết thúc (sau khi cả nhóm duyệt)

- [ ] Chạy lại toàn bộ: `mvn test`, `npm run typecheck && npm test`, `python -m pytest face-node/tests scripts/tests`.
- [ ] Đi hết 10 bước demo mục 8.4 trên thiết bị thật, ghi lại video dự phòng.
- [ ] `git tag v1.0.0 && git push origin v1.0.0` (chỉ khi nhóm thống nhất bản nộp; hạn 24/11/2026).
