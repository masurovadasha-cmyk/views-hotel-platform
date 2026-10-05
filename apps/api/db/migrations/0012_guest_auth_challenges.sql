BEGIN;

CREATE TABLE guest_access_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  reservation_id uuid NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email','sms')),
  destination_hash char(64) NOT NULL,
  token_hash char(64) NOT NULL UNIQUE,
  delivery_status text NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending','delivered','failed')),
  provider_message_id text,
  delivery_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_error text,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_by_user_id uuid REFERENCES users(id),
  created_by_membership_id uuid REFERENCES organization_memberships(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at),
  CHECK (length(destination_hash) = 64),
  CHECK (length(token_hash) = 64)
);

CREATE INDEX guest_access_challenges_active_idx
  ON guest_access_challenges(reservation_id,expires_at,delivery_status)
  WHERE consumed_at IS NULL;

ALTER TABLE guest_access_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY guest_access_challenges_staff_select ON guest_access_challenges
FOR SELECT USING (
  organization_id=app.current_organization_id()
  AND app.current_membership_role() IN ('host','owner','manager','front_desk')
  AND EXISTS(
    SELECT 1
      FROM reservations r
     WHERE r.id=guest_access_challenges.reservation_id
       AND r.organization_id=guest_access_challenges.organization_id
       AND app.can_access_property(r.property_id)
  )
);

CREATE POLICY guest_access_challenges_staff_insert ON guest_access_challenges
FOR INSERT WITH CHECK (
  organization_id=app.current_organization_id()
  AND app.current_membership_role() IN ('host','owner','manager','front_desk')
  AND EXISTS(
    SELECT 1
      FROM reservations r
     WHERE r.id=guest_access_challenges.reservation_id
       AND r.organization_id=guest_access_challenges.organization_id
       AND app.can_access_property(r.property_id)
  )
);

CREATE POLICY guest_access_challenges_staff_update ON guest_access_challenges
FOR UPDATE USING (
  organization_id=app.current_organization_id()
  AND app.current_membership_role() IN ('host','owner','manager','front_desk')
  AND EXISTS(
    SELECT 1
      FROM reservations r
     WHERE r.id=guest_access_challenges.reservation_id
       AND r.organization_id=guest_access_challenges.organization_id
       AND app.can_access_property(r.property_id)
  )
)
WITH CHECK (
  organization_id=app.current_organization_id()
  AND app.current_membership_role() IN ('host','owner','manager','front_desk')
  AND EXISTS(
    SELECT 1
      FROM reservations r
     WHERE r.id=guest_access_challenges.reservation_id
       AND r.organization_id=guest_access_challenges.organization_id
       AND app.can_access_property(r.property_id)
  )
);

CREATE OR REPLACE FUNCTION app.resolve_guest_access_session(target_token_hash text)
RETURNS TABLE(
  session_id uuid,
  organization_id uuid,
  reservation_id uuid,
  property_id uuid,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  v_session_id uuid;
  v_organization_id uuid;
  v_reservation_id uuid;
  v_expires_at timestamptz;
  v_property_id uuid;
BEGIN
  SELECT s.id,s.organization_id,s.reservation_id,s.expires_at
    INTO v_session_id,v_organization_id,v_reservation_id,v_expires_at
    FROM guest_access_sessions s
   WHERE s.token_hash=target_token_hash
     AND s.revoked_at IS NULL
     AND s.expires_at>now()
   LIMIT 1;

  IF v_session_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM set_config('app.organization_id',v_organization_id::text,true);

  SELECT r.property_id
    INTO v_property_id
    FROM reservations r
   WHERE r.id=v_reservation_id
     AND r.organization_id=v_organization_id
     AND r.status IN ('confirmed','checked_in');

  IF v_property_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT v_session_id,v_organization_id,v_reservation_id,v_property_id,v_expires_at;
END
$$;

REVOKE ALL ON FUNCTION app.resolve_guest_access_session(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.exchange_guest_access_challenge(
  target_challenge_token_hash text,
  target_session_token_hash text,
  session_ttl_minutes integer
)
RETURNS TABLE(
  session_id uuid,
  organization_id uuid,
  reservation_id uuid,
  property_id uuid,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  v_organization_id uuid;
  v_reservation_id uuid;
  v_property_id uuid;
  v_session_id uuid := gen_random_uuid();
  v_expires_at timestamptz;
BEGIN
  IF session_ttl_minutes < 15 OR session_ttl_minutes > 10080 THEN
    RAISE EXCEPTION 'INVALID_GUEST_ACCESS_TTL';
  END IF;

  UPDATE guest_access_challenges c
     SET consumed_at=now(),updated_at=now()
   WHERE c.token_hash=target_challenge_token_hash
     AND c.delivery_status='delivered'
     AND c.consumed_at IS NULL
     AND c.expires_at>now()
  RETURNING c.organization_id,c.reservation_id
       INTO v_organization_id,v_reservation_id;

  IF v_organization_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM set_config('app.organization_id',v_organization_id::text,true);

  SELECT r.property_id
    INTO v_property_id
    FROM reservations r
   WHERE r.id=v_reservation_id
     AND r.organization_id=v_organization_id
     AND r.status IN ('confirmed','checked_in');

  IF v_property_id IS NULL THEN
    RETURN;
  END IF;

  v_expires_at:=now()+make_interval(mins=>session_ttl_minutes);

  INSERT INTO guest_access_sessions(
    id,organization_id,reservation_id,token_hash,expires_at
  ) VALUES(
    v_session_id,v_organization_id,v_reservation_id,target_session_token_hash,v_expires_at
  );

  INSERT INTO outbox_events(
    id,organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload
  ) VALUES(
    gen_random_uuid(),v_organization_id,'guest_access_session',v_session_id,
    'identity.guest_access_exchanged',
    'identity:guest-access-exchanged:'||v_session_id::text,
    jsonb_build_object(
      'sessionId',v_session_id,
      'reservationId',v_reservation_id,
      'expiresAt',v_expires_at
    )
  )
  ON CONFLICT(idempotency_key) DO NOTHING;

  RETURN QUERY
  SELECT v_session_id,v_organization_id,v_reservation_id,v_property_id,v_expires_at;
END
$$;

REVOKE ALL ON FUNCTION app.exchange_guest_access_challenge(text,text,integer) FROM PUBLIC;

COMMIT;
