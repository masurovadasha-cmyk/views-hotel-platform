BEGIN;

ALTER TABLE reservations
  ADD COLUMN idempotency_key text,
  ADD COLUMN quote_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN confirmed_at timestamptz,
  ADD COLUMN cancelled_at timestamptz;

CREATE UNIQUE INDEX reservations_org_idempotency_unique
  ON reservations(organization_id,idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE reservation_price_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  line_type text NOT NULL,
  label jsonb NOT NULL,
  amount_minor bigint NOT NULL,
  currency char(3) NOT NULL,
  tax_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reservation_price_lines_reservation_idx
  ON reservation_price_lines(reservation_id,sort_order);

CREATE TABLE booking_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  idempotency_key text NOT NULL,
  command_type text NOT NULL,
  reservation_id uuid REFERENCES reservations(id),
  request_hash text NOT NULL,
  result_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(organization_id,idempotency_key,command_type)
);

CREATE TABLE booking_state_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  reservation_id uuid NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  from_status reservation_status,
  to_status reservation_status,
  actor_user_id uuid,
  idempotency_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,idempotency_key,event_type)
);
CREATE INDEX booking_state_events_reservation_idx
  ON booking_state_events(reservation_id,created_at);

ALTER TABLE reservation_price_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_state_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE reservation_price_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE booking_commands FORCE ROW LEVEL SECURITY;
ALTER TABLE booking_state_events FORCE ROW LEVEL SECURITY;

CREATE POLICY reservation_price_lines_tenant_policy ON reservation_price_lines
  USING (
    EXISTS(
      SELECT 1 FROM reservations r
      WHERE r.id=reservation_price_lines.reservation_id
        AND r.organization_id=app.current_organization_id()
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM reservations r
      WHERE r.id=reservation_price_lines.reservation_id
        AND r.organization_id=app.current_organization_id()
    )
  );

CREATE POLICY booking_commands_tenant_policy ON booking_commands
  USING (organization_id=app.current_organization_id())
  WITH CHECK (organization_id=app.current_organization_id());

CREATE POLICY booking_state_events_tenant_policy ON booking_state_events
  USING (organization_id=app.current_organization_id())
  WITH CHECK (organization_id=app.current_organization_id());

COMMIT;
