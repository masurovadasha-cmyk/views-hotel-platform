CREATE TABLE IF NOT EXISTS integrations(
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_configured',
  external_account_id TEXT,
  scopes TEXT NOT NULL DEFAULT '[]',
  last_health_at TEXT,
  last_sync_at TEXT,
  last_error_code TEXT,
  config_metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organization_id,provider)
);

CREATE TABLE IF NOT EXISTS integration_mappings(
  id TEXT PRIMARY KEY,
  integration_id TEXT NOT NULL REFERENCES integrations(id),
  entity_type TEXT NOT NULL,
  internal_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(integration_id,entity_type,internal_id),
  UNIQUE(integration_id,entity_type,external_id)
);

CREATE TABLE IF NOT EXISTS integration_sync_log(
  id TEXT PRIMARY KEY,
  integration_id TEXT NOT NULL REFERENCES integrations(id),
  direction TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  external_cursor TEXT,
  status TEXT NOT NULL,
  records_processed INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT
);

INSERT OR IGNORE INTO integrations(id,organization_id,provider,status,scopes) VALUES
('integration-booking','views','booking_com','credentials_required','["reservations","rates_availability","messaging"]'),
('integration-airbnb','views','airbnb','partner_access_required','["reservations","rates_availability","listing_sync"]'),
('integration-concierge','views','ai_concierge','credentials_required','["guest_chat","service_triage","translation"]');
