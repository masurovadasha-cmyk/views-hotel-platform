BEGIN;

CREATE TABLE analytics_dashboard_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  scope_key text NOT NULL,
  scope_hash char(64) NOT NULL,
  property_ids uuid[] NOT NULL DEFAULT '{}',
  from_date date NOT NULL,
  to_date date NOT NULL,
  source_signature char(64) NOT NULL,
  payload_version integer NOT NULL DEFAULT 1 CHECK (payload_version > 0),
  payload jsonb NOT NULL,
  generated_by_membership_id uuid NOT NULL REFERENCES organization_memberships(id),
  generated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CHECK (length(scope_key) BETWEEN 1 AND 120),
  CHECK (length(scope_hash)=64),
  CHECK (length(source_signature)=64),
  CHECK (to_date>=from_date),
  CHECK (expires_at>=generated_at),
  UNIQUE(organization_id,scope_key,scope_hash,from_date,to_date)
);

CREATE INDEX analytics_dashboard_cache_expiry_idx
  ON analytics_dashboard_cache(expires_at);

ALTER TABLE analytics_dashboard_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_dashboard_cache FORCE ROW LEVEL SECURITY;

CREATE POLICY analytics_dashboard_cache_scope_safe
ON analytics_dashboard_cache
USING (
  organization_id=app.current_organization_id()
  AND NOT EXISTS(
    SELECT 1
    FROM unnest(property_ids) AS p(property_id)
    WHERE NOT app.can_access_property(p.property_id)
  )
)
WITH CHECK (
  organization_id=app.current_organization_id()
  AND generated_by_membership_id=app.current_membership_id()
  AND NOT EXISTS(
    SELECT 1
    FROM unnest(property_ids) AS p(property_id)
    WHERE NOT app.can_access_property(p.property_id)
  )
);

COMMIT;
