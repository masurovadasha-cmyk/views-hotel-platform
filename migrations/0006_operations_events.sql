CREATE TABLE IF NOT EXISTS operations_events(
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  property_id TEXT NOT NULL REFERENCES properties(id),
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  actor_user_id TEXT,
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_operations_events_aggregate ON operations_events(aggregate_type,aggregate_id,created_at);

CREATE TABLE IF NOT EXISTS inventory_movements(
  id TEXT PRIMARY KEY,
  inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id),
  movement_type TEXT NOT NULL,
  quantity REAL NOT NULL,
  reference_type TEXT,
  reference_id TEXT,
  actor_user_id TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_item ON inventory_movements(inventory_item_id,created_at);
