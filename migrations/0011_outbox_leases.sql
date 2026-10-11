-- Stage 4 outbox concurrency hardening: short-lived processing leases.
ALTER TABLE outbox_events ADD COLUMN lease_token TEXT;
ALTER TABLE outbox_events ADD COLUMN lease_expires_at TEXT;

CREATE INDEX IF NOT EXISTS idx_outbox_lease_ready
ON outbox_events(processed_at,dead_letter_at,available_at,lease_expires_at,created_at);
