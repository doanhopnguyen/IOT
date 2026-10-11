-- Local smart_access demo only. Not a production migration.
-- Run from the backend directory:
-- mysql --default-character-set=utf8mb4 -u root -p --execute="source database/repair_demo_utf8.sql"
-- ASCII hex literals avoid any shell/editor code-page conversion of Vietnamese.
-- Update only known demo identities with the exact observed corrupted bytes.
-- Already-correct values and any different data are left untouched; safe to rerun.

SET NAMES utf8mb4;
USE smart_access;
START TRANSACTION;

-- Nguyen Van A/B and Tran Van C, encoded with their correct Vietnamese accents.
UPDATE accounts AS a
JOIN (
    SELECT 1 AS id, 'nguyenvana@example.com' AS email,
        0x4E677579C39FE29597C3A06E2056E29480C3A26E2041 AS broken,
        0x4E677579E1BB856E2056C4836E2041 AS correct
    UNION ALL SELECT 2, 'nguyenvanb@example.com',
        0x4E677579C39FE29597C3A06E2056E29480C3A26E2042,
        0x4E677579E1BB856E2056C4836E2042
    UNION ALL SELECT 3, 'tranvanc@example.com',
        0x5472C39FE29591C2BA6E2056E29480C3A26E2043,
        0x5472E1BAA76E2056C4836E2043
) AS demo ON a.account_id = demo.id AND BINARY a.email = BINARY demo.email
SET a.full_name = CONVERT(demo.correct USING utf8mb4)
WHERE BINARY a.full_name = demo.broken;
SELECT ROW_COUNT() AS repaired_demo_accounts;

-- Existing demo units 1/2/3: home, office, garage. No rows are inserted.
UPDATE access_units AS u
JOIN (
    SELECT 1 AS id,
        0x43C39FE29597C2A161206E68E2949CC3A1207269E2949CC2AC6E67 AS broken,
        0x43E1BBAD61206E68C3A0207269C3AA6E67 AS correct
    UNION ALL SELECT 2,
        0x43C39FE29597C2A1612076E29480C3A26E207068E2949CE296936E67,
        0x43E1BBAD612076C4836E207068C3B26E67
    UNION ALL SELECT 3,
        0x43C39FE29597C2A161206E68E2949CC3A1207865,
        0x43E1BBAD61206E68C3A0207865
) AS demo ON u.unit_id = demo.id
JOIN accounts AS manager ON manager.account_id = u.manager_id
SET u.unit_name = CONVERT(demo.correct USING utf8mb4)
WHERE u.manager_id = 1
  AND BINARY manager.email = BINARY 'nguyenvana@example.com'
  AND BINARY u.unit_name = demo.broken;
SELECT ROW_COUNT() AS repaired_demo_units;

COMMIT;

SELECT account_id, full_name, HEX(full_name) AS utf8_hex
FROM accounts WHERE account_id IN (1, 2, 3) ORDER BY account_id;
SELECT unit_id, unit_name, HEX(unit_name) AS utf8_hex
FROM access_units WHERE unit_id IN (1, 2, 3) ORDER BY unit_id;
