CREATE TABLE IF NOT EXISTS core_identity_links(
  local_organization_id TEXT NOT NULL,
  local_user_id TEXT NOT NULL,
  core_organization_id TEXT NOT NULL,
  core_user_id TEXT NOT NULL,
  core_membership_id TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(local_organization_id,local_user_id)
);

CREATE INDEX IF NOT EXISTS idx_core_identity_membership
  ON core_identity_links(core_organization_id,core_membership_id)
  WHERE is_active=1;

CREATE TABLE IF NOT EXISTS core_property_links(
  local_organization_id TEXT NOT NULL,
  local_property_id TEXT NOT NULL,
  core_property_id TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(local_organization_id,local_property_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_core_property_uuid
  ON core_property_links(core_property_id)
  WHERE is_active=1;
