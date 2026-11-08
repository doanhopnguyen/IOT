CREATE TABLE firmware_releases (
    release_id BIGINT NOT NULL AUTO_INCREMENT,
    version VARCHAR(50) NOT NULL,
    label VARCHAR(100) NOT NULL,
    hardware_version VARCHAR(50) NOT NULL,
    notes VARCHAR(2000) NOT NULL,
    sha256 CHAR(64) NOT NULL,
    image_size INT NOT NULL,
    image LONGBLOB NOT NULL,
    published_at DATETIME(3) NOT NULL,
    published_by BIGINT NOT NULL,
    PRIMARY KEY (release_id),
    CONSTRAINT uq_firmware_version_hardware UNIQUE (version, hardware_version),
    CONSTRAINT fk_firmware_publisher FOREIGN KEY (published_by) REFERENCES accounts(account_id),
    INDEX idx_firmware_published (published_at)
);
