BEGIN;

CREATE TABLE guest_access_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  reservation_id uuid NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  created_by_user_id uuid REFERENCES users(id),
  created_by_membership_id uuid REFERENCES organization_memberships(id),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at),
  CHECK (length(token_hash) = 64)
);

CREATE INDEX guest_access_sessions_reservation_idx
  ON guest_access_sessions(reservation_id,expires_at)
  WHERE revoked_at IS NULL;

ALTER TABLE guest_access_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY guest_access_sessions_staff_select ON guest_access_sessions
FOR SELECT USING (
  organization_id=app.current_organization_id()
  AND app.current_membership_role() IN ('host','owner','manager','front_desk')
  AND EXISTS(
    SELECT 1
      FROM reservations r
     WHERE r.id=guest_access_sessions.reservation_id
       AND r.organization_id=guest_access_sessions.organization_id
       AND app.can_access_property(r.property_id)
  )
);

CREATE POLICY guest_access_sessions_staff_insert ON guest_access_sessions
FOR INSERT WITH CHECK (
  organization_id=app.current_organization_id()
  AND app.current_membership_role() IN ('host','owner','manager','front_desk')
  AND EXISTS(
    SELECT 1
      FROM reservations r
     WHERE r.id=guest_access_sessions.reservation_id
       AND r.organization_id=guest_access_sessions.organization_id
       AND app.can_access_property(r.property_id)
  )
);

CREATE POLICY guest_access_sessions_staff_update ON guest_access_sessions
FOR UPDATE USING (
  organization_id=app.current_organization_id()
  AND app.current_membership_role() IN ('host','owner','manager','front_desk')
  AND EXISTS(
    SELECT 1
      FROM reservations r
     WHERE r.id=guest_access_sessions.reservation_id
       AND r.organization_id=guest_access_sessions.organization_id
       AND app.can_access_property(r.property_id)
  )
)
WITH CHECK (
  organization_id=app.current_organization_id()
);

CREATE OR REPLACE FUNCTION app.resolve_guest_access_session(target_token_hash text)
RETURNS TABLE(
  session_id uuid,
  organization_id uuid,
  reservation_id uuid,
  property_id uuid,
  expires_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, app
AS $$
  SELECT s.id,s.organization_id,s.reservation_id,r.property_id,s.expires_at
    FROM guest_access_sessions s
    JOIN reservations r ON r.id=s.reservation_id
   WHERE s.token_hash=target_token_hash
     AND s.revoked_at IS NULL
     AND s.expires_at>now()
     AND r.status IN ('confirmed','checked_in')
   LIMIT 1
$$;

REVOKE ALL ON FUNCTION app.resolve_guest_access_session(text) FROM PUBLIC;

COMMIT;
