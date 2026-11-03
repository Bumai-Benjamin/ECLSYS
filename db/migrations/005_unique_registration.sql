-- SEC-6 / D9: one account per email address and per national ID number.
-- Fails if the table already holds duplicates; remove them first.
ALTER TABLE registration
  ADD UNIQUE KEY uq_email (email_address),
  ADD UNIQUE KEY uq_idnum (id_number);
