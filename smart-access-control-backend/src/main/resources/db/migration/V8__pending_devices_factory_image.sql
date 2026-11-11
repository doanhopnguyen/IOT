-- Thiết bị được admin thêm trước khi có chip: chưa có MAC cho tới bước nạp code.
ALTER TABLE device_inventory MODIFY factory_mac VARCHAR(12) NULL;
ALTER TABLE device_inventory
    ADD COLUMN flashed_release_id BIGINT NULL,
    ADD COLUMN flashed_at DATETIME(3) NULL,
    ADD CONSTRAINT fk_inventory_flashed_release FOREIGN KEY (flashed_release_id) REFERENCES firmware_releases(release_id);
-- Factory image (bootloader + partitions + app) để ghi chip trắng ở offset 0x0.
ALTER TABLE firmware_releases
    ADD COLUMN factory_image LONGBLOB NULL,
    ADD COLUMN factory_sha256 CHAR(64) NULL,
    ADD COLUMN factory_size INT NULL;
