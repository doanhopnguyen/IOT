CREATE TABLE door_invitations (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 unit_id BIGINT NOT NULL,
 recipient_id BIGINT NOT NULL,
 status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
 expires_at DATETIME(3) NOT NULL,
 CONSTRAINT fk_invitation_unit FOREIGN KEY (unit_id) REFERENCES access_units(unit_id) ON DELETE CASCADE,
 CONSTRAINT fk_invitation_recipient FOREIGN KEY (recipient_id) REFERENCES accounts(account_id) ON DELETE CASCADE
);
