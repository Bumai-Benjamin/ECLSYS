-- SEC-12: security events (admin logins, on-chain registration failures and
-- DB/chain mismatches). REQUIREMENTS section 5, 004_audit_log.sql.
CREATE TABLE audit_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  actor_reg_id INT NULL,
  action VARCHAR(64) NOT NULL,
  detail VARCHAR(500),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
