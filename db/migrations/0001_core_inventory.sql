BEGIN;

CREATE TYPE organization_type AS ENUM ('platform','host');
CREATE TYPE inventory_period_kind AS ENUM ('reservation','payment_hold','host_block','maintenance','external_calendar');
CREATE TYPE reservation_status AS ENUM ('hold','pending','confirmed','checked_in','checked_out','cancelled','no_show');

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type organization_type NOT NULL,
  legal_name text NOT NULL,
  display_name jsonb NOT NULL DEFAULT '{}'::jsonb,
  country_code char(2) NOT NULL,
  default_currency char(3) NOT NULL,
  timezone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name jsonb NOT NULL,
  country_code char(2) NOT NULL,
  region_code text,
  city text NOT NULL,
  timezone text NOT NULL,
  address jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX properties_org_idx ON properties(organization_id);

CREATE TABLE unit_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id),
  name jsonb NOT NULL,
  max_guests smallint NOT NULL CHECK (max_guests > 0),
  bedrooms smallint NOT NULL DEFAULT 0 CHECK (bedrooms >= 0),
  bathrooms numeric(4,1) NOT NULL DEFAULT 1 CHECK (bathrooms >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id),
  unit_type_id uuid NOT NULL REFERENCES unit_types(id),
  code text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  floor text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(property_id,code)
);
CREATE INDEX units_property_idx ON units(property_id);

CREATE TABLE rate_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id),
  unit_type_id uuid NOT NULL REFERENCES unit_types(id),
  name jsonb NOT NULL,
  currency char(3) NOT NULL,
  base_nightly_minor bigint NOT NULL CHECK (base_nightly_minor >= 0),
  cancellation_policy_snapshot_template jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  property_id uuid NOT NULL REFERENCES properties(id),
  unit_id uuid REFERENCES units(id),
  rate_plan_id uuid REFERENCES rate_plans(id),
  primary_guest_id uuid,
  confirmation_code text NOT NULL UNIQUE,
  status reservation_status NOT NULL,
  check_in_at timestamptz NOT NULL,
  check_out_at timestamptz NOT NULL,
  currency char(3) NOT NULL,
  accommodation_minor bigint NOT NULL DEFAULT 0 CHECK (accommodation_minor >= 0),
  total_minor bigint NOT NULL DEFAULT 0 CHECK (total_minor >= 0),
  cancellation_policy_snapshot jsonb NOT NULL,
  hold_expires_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (check_out_at > check_in_at)
);
CREATE INDEX reservations_property_dates_idx ON reservations(property_id,check_in_at,check_out_at);
CREATE INDEX reservations_org_idx ON reservations(organization_id);

CREATE TABLE inventory_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  property_id uuid NOT NULL REFERENCES properties(id),
  unit_id uuid NOT NULL REFERENCES units(id),
  kind inventory_period_kind NOT NULL,
  reservation_id uuid REFERENCES reservations(id),
  source_ref text,
  stay_period tstzrange NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT isempty(stay_period)),
  CHECK (lower_inc(stay_period) AND NOT upper_inc(stay_period)),
  CHECK (lower(stay_period) < upper(stay_period)),
  CHECK (
    (kind IN ('reservation','payment_hold') AND reservation_id IS NOT NULL)
    OR kind NOT IN ('reservation','payment_hold')
  )
);

ALTER TABLE inventory_periods
  ADD CONSTRAINT inventory_periods_no_overlap
  EXCLUDE USING gist (
    unit_id WITH =,
    stay_period WITH &&
  );

CREATE INDEX inventory_periods_property_idx ON inventory_periods(property_id);
CREATE INDEX inventory_periods_expiry_idx ON inventory_periods(expires_at) WHERE expires_at IS NOT NULL;

CREATE TABLE outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  event_type text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
CREATE INDEX outbox_unpublished_idx ON outbox_events(occurred_at) WHERE published_at IS NULL;

COMMIT;
