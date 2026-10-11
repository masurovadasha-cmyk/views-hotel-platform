BEGIN;

CREATE TABLE analytics_dashboard_cache (
  cache_key char(64) PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL REFERENCES organization_memberships(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  from_date date NOT NULL,
  to_date date NOT NULL,
  schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version > 0),
  source_fingerprint char(64) NOT NULL,
  payload jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CHECK (to_date>=from_date),
  CHECK (length(cache_key)=64),
  CHECK (length(source_fingerprint)=64),
  CHECK (expires_at>generated_at)
);

CREATE INDEX analytics_dashboard_cache_lookup_idx
  ON analytics_dashboard_cache(
    organization_id,membership_id,property_id,from_date,to_date,expires_at DESC
  );

CREATE INDEX analytics_dashboard_cache_expiry_idx
  ON analytics_dashboard_cache(expires_at);

ALTER TABLE analytics_dashboard_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_dashboard_cache FORCE ROW LEVEL SECURITY;

CREATE POLICY analytics_dashboard_cache_scope
ON analytics_dashboard_cache
USING (
  organization_id=app.current_organization_id()
  AND membership_id=app.current_membership_id()
  AND (
    property_id IS NULL
    OR app.can_access_property(property_id)
  )
)
WITH CHECK (
  organization_id=app.current_organization_id()
  AND membership_id=app.current_membership_id()
  AND (
    property_id IS NULL
    OR app.can_access_property(property_id)
  )
);

COMMIT;
