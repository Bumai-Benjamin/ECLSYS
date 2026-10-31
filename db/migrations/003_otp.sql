-- SEC-4: per-request one-time codes (decision D-001: MySQL, not Redis).
CREATE TABLE otp_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reg_id INT NOT NULL,
  code_hash CHAR(64) NOT NULL,
  purpose ENUM('verify_email','register_vote','login') NOT NULL,
  expires_at DATETIME NOT NULL,
  attempts TINYINT NOT NULL DEFAULT 0,
  used_at DATETIME NULL,
  KEY idx_otp_lookup (reg_id, purpose, used_at),
  FOREIGN KEY (reg_id) REFERENCES registration(reg_id)
) ENGINE=InnoDB;
