-- SEC-1: admin accounts are marked by role, not by which login form was used.
ALTER TABLE registration
  ADD COLUMN role ENUM('voter','admin') NOT NULL DEFAULT 'voter';

-- Keep the demo admin from blockchainvoting.sql working.
UPDATE registration SET role = 'admin' WHERE email_address = 'admin@gmail.com';
