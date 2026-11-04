CREATE TABLE device_inventory (
 device_id BIGINT PRIMARY KEY,
 factory_mac VARCHAR(12) NOT NULL UNIQUE,
 claim_hash VARCHAR(64) NULL UNIQUE,
 state VARCHAR(24) NOT NULL DEFAULT 'INVENTORY',
 generation BIGINT NOT NULL DEFAULT 1,
 setup_ready BOOLEAN NOT NULL DEFAULT FALSE,
 door_closed BOOLEAN NULL,
 latch_released BOOLEAN NULL,
 recipient_id BIGINT NULL,
 operation_uuid VARCHAR(36) NULL,
 operation_generation BIGINT NULL,
 operation_actor_id BIGINT NULL,
 state_updated_at DATETIME(3) NULL,
 CONSTRAINT fk_inventory_device FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE
);
