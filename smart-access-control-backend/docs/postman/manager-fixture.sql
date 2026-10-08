-- Optional fixture: run once in a disposable MySQL database after Flyway V1.
-- No DDL; never run against shared/production data. Re-running intentionally fails on unique email/device UID.
START TRANSACTION;
INSERT INTO accounts (full_name, email, password_hash, created_at, updated_at)
VALUES ('Manager fixture', 'manager-38b13d@example.test', 'fixture-not-a-login-hash', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));
SET @manager_id = LAST_INSERT_ID();
INSERT INTO accounts (full_name, email, password_hash, created_at, updated_at)
VALUES ('Other manager fixture', 'other-manager-38b13d@example.test', 'fixture-not-a-login-hash', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));
SET @other_manager_id = LAST_INSERT_ID();
INSERT INTO accounts (full_name, email, password_hash, created_at, updated_at)
VALUES ('User fixture', 'user-38b13d@example.test', 'fixture-not-a-login-hash', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));
SET @user_id = LAST_INSERT_ID();
INSERT INTO accounts (full_name, email, password_hash, created_at, updated_at)
VALUES ('History user fixture', 'history-38b13d@example.test', 'fixture-not-a-login-hash', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));
SET @history_user_id = LAST_INSERT_ID();
INSERT INTO accounts (full_name, email, password_hash, created_at, updated_at)
VALUES ('Nonmember fixture', 'nonmember-38b13d@example.test', 'fixture-not-a-login-hash', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));
SET @nonmember_id = LAST_INSERT_ID();
INSERT INTO access_units (manager_id, unit_name, created_at, updated_at)
VALUES (@manager_id, 'Manager fixture door', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));
SET @unit_id = LAST_INSERT_ID();
INSERT INTO access_units (manager_id, unit_name, created_at, updated_at)
VALUES (@other_manager_id, 'Other fixture door', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));
SET @other_unit_id = LAST_INSERT_ID();
-- Existing memberships are fixtures only; Manager API cannot create them without invitation confirmation.
INSERT INTO user_access (account_id, unit_id, allow_face, allow_fingerprint, allow_rfid, allow_remote_unlock)
VALUES (@user_id, @unit_id, TRUE, TRUE, TRUE, TRUE),
       (@user_id, @other_unit_id, TRUE, TRUE, TRUE, TRUE),
       (@history_user_id, @unit_id, TRUE, TRUE, TRUE, TRUE);
INSERT INTO face_requests (account_id, unit_id, request_type, status, requested_at)
VALUES (@history_user_id, @unit_id, 'ENROLL', 'PENDING', CURRENT_TIMESTAMP(3));
INSERT INTO devices (device_uid, device_name, device_type, lifecycle_status, created_at, updated_at)
VALUES ('SD-FIXTURE-38B13D-FREE', 'Unassigned fixture', 'DOOR_CONTROLLER', 'REGISTERED', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));
INSERT INTO devices (unit_id, device_uid, device_name, device_type, lifecycle_status, created_at, updated_at)
VALUES (@other_unit_id, 'SD-FIXTURE-38B13D-OTHER', 'Other door fixture', 'DOOR_CONTROLLER', 'ACTIVE', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
       (@unit_id, 'SD-FIXTURE-38B13D-SAME', 'Current door fixture', 'DOOR_CONTROLLER', 'ACTIVE', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));
COMMIT;
SELECT @manager_id AS managerId, @other_manager_id AS otherManagerId, @unit_id AS unitId,
       @other_unit_id AS otherUnitId, @user_id AS userId, @history_user_id AS historyUserId,
       @nonmember_id AS nonmemberId;
