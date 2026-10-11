-- Stage 4 Front Desk Golden Flow.
CREATE TABLE IF NOT EXISTS stays(
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  property_id TEXT NOT NULL REFERENCES properties(id),
  reservation_id TEXT NOT NULL UNIQUE REFERENCES reservations(id),
  unit_id TEXT NOT NULL REFERENCES units(id),
  guest_id TEXT NOT NULL REFERENCES guests(id),
  status TEXT NOT NULL DEFAULT 'checked_in',
  checked_in_at TEXT,
  checked_out_at TEXT,
  checked_in_by TEXT,
  checked_out_by TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_stays_property_status ON stays(property_id,status,created_at);
CREATE INDEX IF NOT EXISTS idx_stays_guest ON stays(guest_id,created_at);

CREATE TABLE IF NOT EXISTS reservation_events(
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  property_id TEXT NOT NULL REFERENCES properties(id),
  reservation_id TEXT NOT NULL REFERENCES reservations(id),
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  actor_user_id TEXT,
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_reservation_events_reservation ON reservation_events(reservation_id,created_at);

-- Synthetic staging fixture: no real guest PII.
INSERT OR IGNORE INTO guests(
  id,organization_id,user_id,first_name,last_name,email,phone,vip
) VALUES(
  'guest-stage4-frontdesk','views',NULL,'Stage','Guest','stage.guest@views.invalid',NULL,0
);

INSERT OR IGNORE INTO reservations(
  id,organization_id,property_id,unit_id,primary_guest_id,confirmation_code,status,
  check_in_date,check_out_date,total_amount,currency,version
) VALUES(
  'res-stage4-frontdesk','views','utower','unit-250','guest-stage4-frontdesk',
  'VW-STAGE4-FD','confirmed','2026-10-05','2026-10-06',NULL,'UZS',1
);
