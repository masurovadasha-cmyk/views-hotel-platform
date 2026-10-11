CREATE TABLE IF NOT EXISTS lost_found_items(
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  property_id TEXT NOT NULL REFERENCES properties(id),
  unit_id TEXT REFERENCES units(id),
  guest_id TEXT REFERENCES guests(id),
  item_name TEXT NOT NULL,
  description TEXT,
  found_location TEXT,
  found_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  photo_metadata TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_lost_found_property_status ON lost_found_items(property_id,status,found_at);

CREATE TABLE IF NOT EXISTS damage_reports(
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  property_id TEXT NOT NULL REFERENCES properties(id),
  unit_id TEXT REFERENCES units(id),
  reservation_id TEXT REFERENCES reservations(id),
  reported_by TEXT,
  severity TEXT NOT NULL DEFAULT 'normal',
  title TEXT NOT NULL,
  description TEXT,
  estimated_cost REAL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'open',
  proof_metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_damage_property_status ON damage_reports(property_id,status,created_at);

CREATE TABLE IF NOT EXISTS inventory_items(
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  property_id TEXT NOT NULL REFERENCES properties(id),
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  sku TEXT,
  quantity REAL NOT NULL DEFAULT 0,
  par_level REAL NOT NULL DEFAULT 0,
  unit_of_measure TEXT NOT NULL DEFAULT 'item',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(property_id,sku)
);
CREATE INDEX IF NOT EXISTS idx_inventory_property_category ON inventory_items(property_id,category);

CREATE TABLE IF NOT EXISTS shift_handovers(
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  property_id TEXT NOT NULL REFERENCES properties(id),
  from_shift TEXT NOT NULL,
  to_shift TEXT NOT NULL,
  unresolved_json TEXT NOT NULL DEFAULT '[]',
  risks_json TEXT NOT NULL DEFAULT '[]',
  follow_up_json TEXT NOT NULL DEFAULT '[]',
  created_by TEXT,
  acknowledged_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  acknowledged_at TEXT
);
