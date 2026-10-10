BEGIN;

CREATE TYPE rate_adjustment_kind AS ENUM ('percentage','fixed');
CREATE TYPE rate_trigger_kind AS ENUM ('length_of_stay','early_booking','last_minute');
CREATE TYPE charge_rule_kind AS ENUM ('percent_of_accommodation','fixed_per_booking','fixed_per_guest_night');
CREATE TYPE residency_scope AS ENUM ('all','resident','nonresident');

CREATE TABLE rate_day_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_plan_id uuid NOT NULL REFERENCES rate_plans(id) ON DELETE CASCADE,
  stay_date date NOT NULL,
  nightly_minor bigint CHECK (nightly_minor IS NULL OR nightly_minor >= 0),
  min_stay smallint CHECK (min_stay IS NULL OR min_stay > 0),
  closed boolean NOT NULL DEFAULT false,
  closed_to_arrival boolean NOT NULL DEFAULT false,
  closed_to_departure boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(rate_plan_id,stay_date)
);
CREATE INDEX rate_day_overrides_plan_date_idx ON rate_day_overrides(rate_plan_id,stay_date);

CREATE TABLE rate_weekday_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_plan_id uuid NOT NULL REFERENCES rate_plans(id) ON DELETE CASCADE,
  iso_weekday smallint NOT NULL CHECK (iso_weekday BETWEEN 1 AND 7),
  nightly_minor bigint CHECK (nightly_minor IS NULL OR nightly_minor >= 0),
  price_delta_bps integer CHECK (price_delta_bps IS NULL OR price_delta_bps BETWEEN -10000 AND 100000),
  min_stay smallint CHECK (min_stay IS NULL OR min_stay > 0),
  closed boolean NOT NULL DEFAULT false,
  closed_to_arrival boolean NOT NULL DEFAULT false,
  closed_to_departure boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(rate_plan_id,iso_weekday)
);

CREATE TABLE rate_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_plan_id uuid NOT NULL REFERENCES rate_plans(id) ON DELETE CASCADE,
  code text NOT NULL,
  name jsonb NOT NULL,
  trigger_kind rate_trigger_kind NOT NULL,
  adjustment_kind rate_adjustment_kind NOT NULL,
  amount_bps integer,
  amount_minor bigint,
  min_nights smallint,
  min_days_before_arrival integer,
  max_days_before_arrival integer,
  priority integer NOT NULL DEFAULT 100,
  stackable boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  effective_from date,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (adjustment_kind='percentage' AND amount_bps IS NOT NULL AND amount_minor IS NULL)
    OR
    (adjustment_kind='fixed' AND amount_minor IS NOT NULL AND amount_bps IS NULL)
  ),
  CHECK (amount_minor IS NULL OR amount_minor >= 0),
  CHECK (amount_bps IS NULL OR amount_bps BETWEEN 0 AND 10000),
  UNIQUE(rate_plan_id,code)
);

CREATE TABLE charge_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  property_id uuid REFERENCES properties(id),
  country_code char(2) NOT NULL,
  region_code text,
  code text NOT NULL,
  label jsonb NOT NULL,
  rule_kind charge_rule_kind NOT NULL,
  rate_bps integer,
  amount_minor bigint,
  currency char(3),
  residency residency_scope NOT NULL DEFAULT 'all',
  min_age smallint CHECK (min_age IS NULL OR min_age >= 0),
  effective_from date NOT NULL,
  effective_to date,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (rule_kind='percent_of_accommodation' AND rate_bps IS NOT NULL AND amount_minor IS NULL)
    OR
    (rule_kind IN ('fixed_per_booking','fixed_per_guest_night') AND amount_minor IS NOT NULL AND currency IS NOT NULL AND rate_bps IS NULL)
  )
);
CREATE INDEX charge_rules_lookup_idx
  ON charge_rules(organization_id,property_id,country_code,region_code,effective_from,effective_to)
  WHERE active=true;

CREATE TABLE cancellation_policy_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  code text NOT NULL,
  name jsonb NOT NULL,
  rules jsonb NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,code)
);

ALTER TABLE rate_plans
  ADD COLUMN cancellation_policy_id uuid REFERENCES cancellation_policy_templates(id);

ALTER TABLE reservation_price_lines
  ADD COLUMN code text,
  ADD COLUMN refundable boolean NOT NULL DEFAULT true,
  ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE booking_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  property_id uuid NOT NULL REFERENCES properties(id),
  unit_id uuid NOT NULL REFERENCES units(id),
  rate_plan_id uuid NOT NULL REFERENCES rate_plans(id),
  check_in_at timestamptz NOT NULL,
  check_out_at timestamptz NOT NULL,
  guest_context jsonb NOT NULL,
  currency char(3) NOT NULL,
  accommodation_minor bigint NOT NULL CHECK (accommodation_minor >= 0),
  discount_minor bigint NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  charges_minor bigint NOT NULL DEFAULT 0 CHECK (charges_minor >= 0),
  total_minor bigint NOT NULL CHECK (total_minor >= 0),
  cancellation_policy_snapshot jsonb NOT NULL,
  pricing_snapshot jsonb NOT NULL,
  input_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (check_out_at > check_in_at),
  CHECK (total_minor = accommodation_minor - discount_minor + charges_minor)
);
CREATE INDEX booking_quotes_lookup_idx ON booking_quotes(organization_id,property_id,unit_id,created_at DESC);
CREATE INDEX booking_quotes_expiry_idx ON booking_quotes(expires_at);

CREATE TABLE booking_quote_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES booking_quotes(id) ON DELETE RESTRICT,
  line_type text NOT NULL,
  code text NOT NULL,
  label jsonb NOT NULL,
  amount_minor bigint NOT NULL,
  currency char(3) NOT NULL,
  refundable boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX booking_quote_lines_quote_idx ON booking_quote_lines(quote_id,sort_order);

CREATE OR REPLACE FUNCTION app.prevent_quote_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'booking quotes are immutable';
END
$$;

CREATE TRIGGER booking_quotes_immutable
  BEFORE UPDATE OR DELETE ON booking_quotes
  FOR EACH ROW EXECUTE FUNCTION app.prevent_quote_mutation();

CREATE TRIGGER booking_quote_lines_immutable
  BEFORE UPDATE OR DELETE ON booking_quote_lines
  FOR EACH ROW EXECUTE FUNCTION app.prevent_quote_mutation();

ALTER TABLE rate_day_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_weekday_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE charge_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE cancellation_policy_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_quote_lines ENABLE ROW LEVEL SECURITY;

ALTER TABLE rate_day_overrides FORCE ROW LEVEL SECURITY;
ALTER TABLE rate_weekday_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE rate_adjustments FORCE ROW LEVEL SECURITY;
ALTER TABLE charge_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE cancellation_policy_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE booking_quotes FORCE ROW LEVEL SECURITY;
ALTER TABLE booking_quote_lines FORCE ROW LEVEL SECURITY;

CREATE POLICY rate_day_overrides_tenant ON rate_day_overrides
USING (EXISTS(
  SELECT 1 FROM rate_plans rp JOIN properties p ON p.id=rp.property_id
  WHERE rp.id=rate_day_overrides.rate_plan_id AND p.organization_id=app.current_organization_id()
))
WITH CHECK (EXISTS(
  SELECT 1 FROM rate_plans rp JOIN properties p ON p.id=rp.property_id
  WHERE rp.id=rate_day_overrides.rate_plan_id AND p.organization_id=app.current_organization_id()
));

CREATE POLICY rate_weekday_rules_tenant ON rate_weekday_rules
USING (EXISTS(
  SELECT 1 FROM rate_plans rp JOIN properties p ON p.id=rp.property_id
  WHERE rp.id=rate_weekday_rules.rate_plan_id AND p.organization_id=app.current_organization_id()
))
WITH CHECK (EXISTS(
  SELECT 1 FROM rate_plans rp JOIN properties p ON p.id=rp.property_id
  WHERE rp.id=rate_weekday_rules.rate_plan_id AND p.organization_id=app.current_organization_id()
));

CREATE POLICY rate_adjustments_tenant ON rate_adjustments
USING (EXISTS(
  SELECT 1 FROM rate_plans rp JOIN properties p ON p.id=rp.property_id
  WHERE rp.id=rate_adjustments.rate_plan_id AND p.organization_id=app.current_organization_id()
))
WITH CHECK (EXISTS(
  SELECT 1 FROM rate_plans rp JOIN properties p ON p.id=rp.property_id
  WHERE rp.id=rate_adjustments.rate_plan_id AND p.organization_id=app.current_organization_id()
));

CREATE POLICY charge_rules_tenant ON charge_rules
USING (organization_id=app.current_organization_id())
WITH CHECK (organization_id=app.current_organization_id());

CREATE POLICY cancellation_policies_tenant ON cancellation_policy_templates
USING (organization_id=app.current_organization_id())
WITH CHECK (organization_id=app.current_organization_id());

CREATE POLICY booking_quotes_tenant ON booking_quotes
USING (organization_id=app.current_organization_id())
WITH CHECK (organization_id=app.current_organization_id());

CREATE POLICY booking_quote_lines_tenant ON booking_quote_lines
USING (EXISTS(
  SELECT 1 FROM booking_quotes q
  WHERE q.id=booking_quote_lines.quote_id AND q.organization_id=app.current_organization_id()
))
WITH CHECK (EXISTS(
  SELECT 1 FROM booking_quotes q
  WHERE q.id=booking_quote_lines.quote_id AND q.organization_id=app.current_organization_id()
));

COMMIT;
