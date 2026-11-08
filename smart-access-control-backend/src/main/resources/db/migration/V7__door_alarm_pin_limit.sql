ALTER TABLE access_units
    ADD COLUMN pin_failure_limit SMALLINT NOT NULL DEFAULT 5,
    ADD CONSTRAINT chk_units_pin_failure_limit CHECK (pin_failure_limit BETWEEN 1 AND 10);
