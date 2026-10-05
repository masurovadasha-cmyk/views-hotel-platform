BEGIN;

DELETE FROM analytics_dashboard_cache;

ALTER TABLE analytics_dashboard_cache
  ADD COLUMN property_ids uuid[] NOT NULL DEFAULT '{}';

ALTER TABLE analytics_dashboard_cache
  ADD CONSTRAINT analytics_dashboard_cache_property_ids_no_nulls
    CHECK (array_position(property_ids,NULL) IS NULL),
  ADD CONSTRAINT analytics_dashboard_cache_property_scope_match
    CHECK (
      property_id IS NULL
      OR property_id=ANY(property_ids)
    );

DROP POLICY IF EXISTS analytics_dashboard_cache_scope
  ON analytics_dashboard_cache;

CREATE POLICY analytics_dashboard_cache_scope
ON analytics_dashboard_cache
USING (
  organization_id=app.current_organization_id()
  AND membership_id=app.current_membership_id()
  AND (
    property_id IS NULL
    OR app.can_access_property(property_id)
  )
  AND NOT EXISTS(
    SELECT 1
    FROM unnest(property_ids) AS p(property_id)
    WHERE NOT app.can_access_property(p.property_id)
  )
)
WITH CHECK (
  organization_id=app.current_organization_id()
  AND membership_id=app.current_membership_id()
  AND (
    property_id IS NULL
    OR app.can_access_property(property_id)
  )
  AND NOT EXISTS(
    SELECT 1
    FROM unnest(property_ids) AS p(property_id)
    WHERE NOT app.can_access_property(p.property_id)
  )
);

COMMIT;
