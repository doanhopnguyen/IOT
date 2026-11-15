ALTER TABLE devices
    ADD COLUMN edge_software_version VARCHAR(100) NULL,
    ADD COLUMN edge_model_version VARCHAR(100) NULL,
    ADD COLUMN edge_camera_status VARCHAR(30) NULL,
    ADD COLUMN edge_recognition_status VARCHAR(30) NULL,
    ADD COLUMN edge_error_code VARCHAR(100) NULL,
    ADD COLUMN edge_last_frame_at DATETIME(3) NULL,
    ADD COLUMN edge_reported_at DATETIME(3) NULL;
