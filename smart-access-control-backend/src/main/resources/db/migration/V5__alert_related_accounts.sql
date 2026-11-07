CREATE TABLE event_related_accounts (
    event_id BIGINT NOT NULL,
    account_id BIGINT NOT NULL,
    PRIMARY KEY (event_id, account_id),
    KEY idx_event_related_account (account_id, event_id),
    CONSTRAINT fk_event_related_event FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE CASCADE,
    CONSTRAINT fk_event_related_account FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
