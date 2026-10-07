BEGIN;
-- Synthetic reception turnover only; this does not grant housekeeping permissions.
CREATE TABLE local_stay_turnovers (
 reservation_id uuid PRIMARY KEY REFERENCES reservations(id),
 organization_id uuid NOT NULL REFERENCES organizations(id),
 property_id uuid NOT NULL REFERENCES properties(id),
 unit_id uuid NOT NULL REFERENCES units(id),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 completed_at timestamptz,
 completed_by uuid REFERENCES users(id),
 CHECK ((status='pending' AND completed_at IS NULL AND completed_by IS NULL)
     OR (status='completed' AND completed_at IS NOT NULL AND completed_by IS NOT NULL))
);
CREATE INDEX local_stay_turnover_pending ON local_stay_turnovers(organization_id,property_id,unit_id) WHERE status='pending';
ALTER TABLE local_stay_turnovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_stay_turnovers FORCE ROW LEVEL SECURITY;
CREATE POLICY local_stay_turnover_scope ON local_stay_turnovers
 USING(organization_id=app.current_organization_id() AND app.can_access_property(property_id))
 WITH CHECK(organization_id=app.current_organization_id() AND app.can_access_property(property_id)
 AND EXISTS(SELECT 1 FROM reservations r WHERE r.id=reservation_id AND r.organization_id=local_stay_turnovers.organization_id
 AND r.property_id=local_stay_turnovers.property_id AND r.unit_id=local_stay_turnovers.unit_id
 AND r.status='checked_out' AND r.total_minor=0 AND r.quote_snapshot->'localStayPilot'='true'::jsonb));
COMMIT;
