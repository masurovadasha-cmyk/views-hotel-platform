-- Stage 4 release/readiness hardening: outbox retry, dead-letter and delivery audit.
ALTER TABLE outbox_events ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE outbox_events ADD COLUMN available_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE outbox_events ADD COLUMN last_attempt_at TEXT;
ALTER TABLE outbox_events ADD COLUMN last_error TEXT;
ALTER TABLE outbox_events ADD COLUMN dead_letter_at TEXT;

CREATE INDEX IF NOT EXISTS idx_outbox_ready
ON outbox_events(processed_at,dead_letter_at,available_at,created_at);

CREATE TABLE IF NOT EXISTS outbox_deliveries(
  id TEXT PRIMARY KEY,
  outbox_event_id TEXT NOT NULL REFERENCES outbox_events(id),
  consumer TEXT NOT NULL,
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  delivered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(outbox_event_id,consumer)
);
CREATE INDEX IF NOT EXISTS idx_outbox_deliveries_event
ON outbox_deliveries(outbox_event_id,consumer,delivered_at);
