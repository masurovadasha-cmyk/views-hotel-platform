BEGIN;

-- VIEWS Stage 7: durable order storage foundation. This migration does not enable public API routes.
CREATE TABLE market_service_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  property_id uuid NOT NULL REFERENCES properties(id),
  unit_id uuid REFERENCES units(id),
  actor_user_id uuid REFERENCES users(id),
  idempotency_key text NOT NULL,
  request_hash char(64) NOT NULL,
  status text NOT NULL DEFAULT 'new'
    CHECK(status IN ('new','picking','packed','out_for_delivery','delivered','cancelled')),
  payment_status text NOT NULL DEFAULT 'unpaid'
    CHECK(payment_status IN ('unpaid','pending','paid','room_charge_pending','failed','refunded')),
  currency char(3) NOT NULL DEFAULT 'UZS' CHECK(currency='UZS'),
  subtotal_minor bigint NOT NULL CHECK(subtotal_minor>=0),
  delivery_minor bigint NOT NULL DEFAULT 0 CHECK(delivery_minor>=0),
  total_minor bigint GENERATED ALWAYS AS (subtotal_minor+delivery_minor) STORED,
  delivery_slot text NOT NULL,
  guest_comment text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,idempotency_key),
  UNIQUE(organization_id,id)
);
CREATE INDEX market_service_orders_property_status_idx ON market_service_orders(organization_id,property_id,status,created_at DESC);

CREATE TABLE market_service_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  order_id uuid NOT NULL,
  sku text NOT NULL,
  product_name_snapshot text NOT NULL,
  quantity integer NOT NULL CHECK(quantity>0),
  unit_price_minor bigint NOT NULL CHECK(unit_price_minor>=0),
  line_total_minor bigint GENERATED ALWAYS AS (quantity::bigint*unit_price_minor) STORED,
  UNIQUE(organization_id,order_id,sku),
  FOREIGN KEY(organization_id,order_id) REFERENCES market_service_orders(organization_id,id) ON DELETE RESTRICT
);
CREATE INDEX market_service_order_lines_order_idx ON market_service_order_lines(organization_id,order_id);

CREATE TABLE market_service_assignments (
  order_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  assignee_membership_id uuid NOT NULL REFERENCES organization_memberships(id),
  priority text NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal','high','urgent')),
  due_at timestamptz NOT NULL,
  assigned_by_membership_id uuid NOT NULL REFERENCES organization_memberships(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(organization_id,order_id) REFERENCES market_service_orders(organization_id,id) ON DELETE RESTRICT,
  CHECK(due_at>assigned_at)
);
CREATE INDEX market_service_assignments_due_idx ON market_service_assignments(organization_id,due_at);

CREATE TABLE market_service_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  order_id uuid NOT NULL,
  actor_membership_id uuid REFERENCES organization_memberships(id),
  action text NOT NULL CHECK(length(action) BETWEEN 1 AND 80),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(organization_id,order_id) REFERENCES market_service_orders(organization_id,id) ON DELETE RESTRICT
);
CREATE INDEX market_service_events_order_idx ON market_service_events(organization_id,order_id,id);

-- Do not expose tenant data to anonymous callers or bypass RLS.
ALTER TABLE market_service_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_service_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE market_service_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_service_order_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE market_service_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_service_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE market_service_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_service_events FORCE ROW LEVEL SECURITY;

CREATE POLICY market_orders_read ON market_service_orders FOR SELECT
 USING (organization_id=app.current_organization_id() AND app.current_membership_role() IN ('owner','manager','front_desk','concierge','platform_admin'));
CREATE POLICY market_lines_read ON market_service_order_lines FOR SELECT
 USING (organization_id=app.current_organization_id() AND app.current_membership_role() IN ('owner','manager','front_desk','concierge','platform_admin'));
CREATE POLICY market_assignments_read ON market_service_assignments FOR SELECT
 USING (organization_id=app.current_organization_id() AND app.current_membership_role() IN ('owner','manager','front_desk','concierge','platform_admin'));
CREATE POLICY market_events_read ON market_service_events FOR SELECT
 USING (organization_id=app.current_organization_id() AND app.current_membership_role() IN ('owner','manager','front_desk','concierge','platform_admin'));

-- No INSERT/UPDATE/DELETE policy is intentionally granted yet.
-- Mutations must go through a future reviewed transaction boundary with
-- verified role, scoped property, idempotency and inventory reservation.
-- Event records are append-only and payment/refund state is independent of order status.

COMMIT;
