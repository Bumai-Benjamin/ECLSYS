-- SEC-5: express-mysql-session store (decision D-001: MySQL, not Redis).
-- Created here rather than by the store, because the app's DB user (SEC-12)
-- has no CREATE rights.
CREATE TABLE IF NOT EXISTS sessions (
  session_id VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
  expires INT(11) UNSIGNED NOT NULL,
  data MEDIUMTEXT COLLATE utf8mb4_bin,
  PRIMARY KEY (session_id)
) ENGINE=InnoDB;
