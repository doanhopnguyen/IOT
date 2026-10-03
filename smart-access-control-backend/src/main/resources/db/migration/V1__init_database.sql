-- MySQL 8.0.16+; history is preserved by restrictive foreign keys.

CREATE TABLE accounts (
    account_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(254) NULL,
    phone VARCHAR(20) NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    CONSTRAINT uk_accounts_email UNIQUE (email),
    CONSTRAINT uk_accounts_phone UNIQUE (phone),
    CONSTRAINT chk_accounts_contact CHECK (email IS NOT NULL OR phone IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE access_units (
    unit_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    manager_id BIGINT NULL,
    unit_name VARCHAR(100) NOT NULL,
    face_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    fingerprint_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    rfid_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    pin_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    remote_unlock_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    access_pin_hash VARCHAR(255) NULL,
    unlock_duration_sec SMALLINT NOT NULL DEFAULT 5,
    door_open_timeout_sec SMALLINT NOT NULL DEFAULT 60,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    INDEX idx_access_units_manager_id (manager_id),
    CONSTRAINT fk_access_units_manager_id FOREIGN KEY (manager_id) REFERENCES accounts (account_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE devices (
    device_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    unit_id BIGINT NULL,
    device_uid VARCHAR(64) NOT NULL,
    device_name VARCHAR(100) NOT NULL,
    device_type VARCHAR(30) NOT NULL,
    bootstrap_secret_hash VARCHAR(255) NULL,
    device_secret_hash VARCHAR(255) NULL,
    local_admin_pin_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    local_admin_pin_hash VARCHAR(255) NULL,
    hardware_version VARCHAR(50) NULL,
    firmware_version VARCHAR(50) NULL,
    lifecycle_status VARCHAR(30) NOT NULL DEFAULT 'REGISTERED',
    last_seen_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    CONSTRAINT uk_devices_device_uid UNIQUE (device_uid),
    INDEX idx_devices_unit_id (unit_id),
    INDEX idx_devices_lifecycle_status_last_seen_at (lifecycle_status, last_seen_at),
    CONSTRAINT fk_devices_unit_id FOREIGN KEY (unit_id) REFERENCES access_units (unit_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_access (
    account_id BIGINT NOT NULL,
    unit_id BIGINT NOT NULL,
    allow_face BOOLEAN NOT NULL DEFAULT FALSE,
    allow_fingerprint BOOLEAN NOT NULL DEFAULT FALSE,
    allow_rfid BOOLEAN NOT NULL DEFAULT FALSE,
    allow_remote_unlock BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (account_id, unit_id),
    INDEX idx_user_access_unit_id (unit_id),
    CONSTRAINT fk_user_access_account_id FOREIGN KEY (account_id) REFERENCES accounts (account_id) ON DELETE RESTRICT,
    CONSTRAINT fk_user_access_unit_id FOREIGN KEY (unit_id) REFERENCES access_units (unit_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE credentials (
    credential_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    account_id BIGINT NOT NULL,
    credential_type VARCHAR(30) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    face_embedding BLOB NULL,
    embedding_model VARCHAR(100) NULL,
    rfid_uid VARCHAR(64) NULL,
    device_id BIGINT NULL,
    local_template_id SMALLINT NULL,
    created_at DATETIME(3) NOT NULL,
    revoked_at DATETIME(3) NULL,
    INDEX idx_credentials_account_id_credential_type_status (account_id, credential_type, status),
    INDEX idx_credentials_rfid_uid_status (rfid_uid, status),
    INDEX idx_credentials_device_id_local_template_id_status (device_id, local_template_id, status),
    CONSTRAINT fk_credentials_account_id FOREIGN KEY (account_id) REFERENCES accounts (account_id) ON DELETE RESTRICT,
    CONSTRAINT fk_credentials_device_id FOREIGN KEY (device_id) REFERENCES devices (device_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE face_requests (
    request_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    account_id BIGINT NOT NULL,
    unit_id BIGINT NOT NULL,
    request_type VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    requested_at DATETIME(3) NOT NULL,
    reviewed_at DATETIME(3) NULL,
    completed_at DATETIME(3) NULL,
    INDEX idx_face_requests_unit_id_status (unit_id, status),
    INDEX idx_face_requests_account_id_requested_at (account_id, requested_at),
    CONSTRAINT fk_face_requests_user_access FOREIGN KEY (account_id, unit_id)
        REFERENCES user_access (account_id, unit_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE access_logs (
    access_log_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    access_uuid CHAR(36) NOT NULL,
    unit_id BIGINT NOT NULL,
    source_device_id BIGINT NOT NULL,
    account_id BIGINT NULL,
    credential_id BIGINT NULL,
    method VARCHAR(30) NOT NULL,
    result VARCHAR(20) NOT NULL,
    reason_code VARCHAR(50) NULL,
    occurred_at DATETIME(3) NOT NULL,
    received_at DATETIME(3) NOT NULL,
    CONSTRAINT uk_access_logs_access_uuid UNIQUE (access_uuid),
    INDEX idx_access_logs_unit_id_occurred_at (unit_id, occurred_at),
    INDEX idx_access_logs_account_id_occurred_at (account_id, occurred_at),
    INDEX idx_access_logs_source_device_id_occurred_at (source_device_id, occurred_at),
    CONSTRAINT fk_access_logs_unit_id FOREIGN KEY (unit_id) REFERENCES access_units (unit_id) ON DELETE RESTRICT,
    CONSTRAINT fk_access_logs_source_device_id FOREIGN KEY (source_device_id) REFERENCES devices (device_id) ON DELETE RESTRICT,
    CONSTRAINT fk_access_logs_account_id FOREIGN KEY (account_id) REFERENCES accounts (account_id) ON DELETE RESTRICT,
    CONSTRAINT fk_access_logs_credential_id FOREIGN KEY (credential_id) REFERENCES credentials (credential_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE telemetry (
    telemetry_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    message_uuid CHAR(36) NOT NULL,
    device_id BIGINT NOT NULL,
    metric_name VARCHAR(50) NOT NULL,
    metric_value VARCHAR(100) NOT NULL,
    measurement_unit VARCHAR(20) NULL,
    occurred_at DATETIME(3) NOT NULL,
    received_at DATETIME(3) NOT NULL,
    CONSTRAINT uk_telemetry_message_uuid UNIQUE (message_uuid),
    INDEX idx_telemetry_device_id_occurred_at (device_id, occurred_at),
    INDEX idx_telemetry_device_id_metric_name_occurred_at (device_id, metric_name, occurred_at),
    CONSTRAINT fk_telemetry_device_id FOREIGN KEY (device_id) REFERENCES devices (device_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE events (
    event_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_uuid CHAR(36) NOT NULL,
    device_id BIGINT NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'INFO',
    alert_status VARCHAR(20) NOT NULL DEFAULT 'NONE',
    message VARCHAR(255) NULL,
    occurred_at DATETIME(3) NOT NULL,
    received_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    CONSTRAINT uk_events_event_uuid UNIQUE (event_uuid),
    INDEX idx_events_device_id_occurred_at (device_id, occurred_at),
    INDEX idx_events_alert_status_severity_occurred_at (alert_status, severity, occurred_at),
    CONSTRAINT fk_events_device_id FOREIGN KEY (device_id) REFERENCES devices (device_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE commands (
    command_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    command_uuid CHAR(36) NOT NULL,
    device_id BIGINT NOT NULL,
    requested_by BIGINT NULL,
    command_type VARCHAR(50) NOT NULL,
    payload JSON NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    requested_at DATETIME(3) NOT NULL,
    acknowledged_at DATETIME(3) NULL,
    result_message VARCHAR(255) NULL,
    CONSTRAINT uk_commands_command_uuid UNIQUE (command_uuid),
    INDEX idx_commands_device_id_requested_at (device_id, requested_at),
    INDEX idx_commands_requested_by_requested_at (requested_by, requested_at),
    CONSTRAINT fk_commands_device_id FOREIGN KEY (device_id) REFERENCES devices (device_id) ON DELETE RESTRICT,
    CONSTRAINT fk_commands_requested_by FOREIGN KEY (requested_by) REFERENCES accounts (account_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE audit_logs (
    audit_log_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    actor_id BIGINT NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id BIGINT NULL,
    details JSON NULL,
    created_at DATETIME(3) NOT NULL,
    INDEX idx_audit_logs_actor_id_created_at (actor_id, created_at),
    CONSTRAINT fk_audit_logs_actor_id FOREIGN KEY (actor_id) REFERENCES accounts (account_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
