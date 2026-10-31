-- SEC-3: bcrypt hashes (60 chars) replace MD5; existing MD5 hashes keep
-- working and are upgraded on the next login. The duplicate
-- confirm_password hash is no longer stored.
ALTER TABLE registration
  DROP COLUMN confirm_password,
  MODIFY password VARCHAR(100) NOT NULL;
