ALTER TABLE access_units
    ADD COLUMN auto_lock_wait_for_close BOOLEAN NOT NULL DEFAULT TRUE;
