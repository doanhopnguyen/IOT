-- Bộ camera AI do admin tạo trước; chủ cửa ghép vào cửa bằng mã dùng một lần (lưu SHA-256, không lưu mã gốc).
-- Hai lệnh riêng để chạy được cả trên TiDB.
ALTER TABLE devices ADD COLUMN pairing_code_hash CHAR(64) NULL;
CREATE UNIQUE INDEX uk_devices_pairing_code_hash ON devices (pairing_code_hash);
