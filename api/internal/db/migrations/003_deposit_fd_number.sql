ALTER TABLE deposits
  ADD COLUMN IF NOT EXISTS fd_number TEXT;

CREATE INDEX IF NOT EXISTS deposits_status_idx ON deposits(status);
