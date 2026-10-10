BEGIN;
CREATE TABLE service_catalog (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
 property_id uuid NOT NULL, code text NOT NULL CHECK(length(code) BETWEEN 1 AND 80),
 name jsonb NOT NULL CHECK(jsonb_typeof(name)='object'),
 currency char(3) NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 price_minor bigint NOT NULL CHECK(price_minor>=0),
 commission_bps integer NOT NULL DEFAULT 0 CHECK(commission_bps BETWEEN 0 AND 10000),
 active boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,property_id) REFERENCES properties(organization_id,id),
 UNIQUE(organization_id,property_id,code), UNIQUE(organization_id,property_id,id,currency)
);
CREATE TABLE service_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, property_id uuid NOT NULL,
 service_id uuid NOT NULL, reservation_id uuid, guest_profile_id uuid NOT NULL,
 currency char(3) NOT NULL, quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 1000),
 total_minor bigint NOT NULL CHECK(total_minor>=0), commission_minor bigint NOT NULL CHECK(commission_minor>=0 AND commission_minor<=total_minor),
 status text NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','accepted','in_progress','completed','cancelled')),
 requested_for timestamptz NOT NULL, snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
 idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 160),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,property_id,service_id,currency) REFERENCES service_catalog(organization_id,property_id,id,currency),
 FOREIGN KEY(organization_id,property_id,reservation_id,currency) REFERENCES reservations(organization_id,property_id,id,currency),
 FOREIGN KEY(organization_id,guest_profile_id) REFERENCES guest_profiles(organization_id,id),
 UNIQUE(organization_id,idempotency_key)
);
CREATE INDEX service_orders_work_idx ON service_orders(organization_id,property_id,status,requested_for,id);
CREATE INDEX service_orders_reservation_idx ON service_orders(organization_id,reservation_id) WHERE reservation_id IS NOT NULL;

CREATE TABLE promotion_codes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 code text NOT NULL CHECK(code ~ '^[A-Z0-9_-]{3,40}$'),
 name jsonb NOT NULL CHECK(jsonb_typeof(name)='object'),
 discount_bps integer CHECK(discount_bps BETWEEN 1 AND 10000),
 discount_minor bigint CHECK(discount_minor>0), currency char(3),
 valid_from timestamptz NOT NULL, valid_until timestamptz NOT NULL,
 max_redemptions integer NOT NULL CHECK(max_redemptions>0), per_guest_limit integer NOT NULL DEFAULT 1 CHECK(per_guest_limit>0),
 active boolean NOT NULL DEFAULT false,
 CHECK(valid_until>valid_from),
 CHECK((discount_bps IS NOT NULL AND discount_minor IS NULL AND currency IS NULL) OR
       (discount_bps IS NULL AND discount_minor IS NOT NULL AND currency ~ '^[A-Z]{3}$' AND currency IS NOT NULL)),
 UNIQUE(organization_id,code), UNIQUE(organization_id,id)
);
CREATE TABLE promotion_redemptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, property_id uuid NOT NULL,
 promotion_id uuid NOT NULL, reservation_id uuid NOT NULL, guest_profile_id uuid NOT NULL,
 currency char(3) NOT NULL, discount_minor bigint NOT NULL CHECK(discount_minor>0),
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,promotion_id) REFERENCES promotion_codes(organization_id,id),
 FOREIGN KEY(organization_id,property_id,reservation_id,currency) REFERENCES reservations(organization_id,property_id,id,currency),
 FOREIGN KEY(organization_id,guest_profile_id) REFERENCES guest_profiles(organization_id,id),
 UNIQUE(organization_id,reservation_id)
);
CREATE INDEX promotion_redemptions_limit_idx ON promotion_redemptions(organization_id,promotion_id,guest_profile_id);
-- Counts must include other property scopes, without exposing their rows. Parent
-- lock serializes concurrent redemptions; no decrement/reuse on cancellation.
CREATE FUNCTION app.validate_promotion_redemption() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE promo public.promotion_codes; used_count bigint; guest_count bigint;
BEGIN
 SELECT * INTO promo FROM public.promotion_codes WHERE organization_id=NEW.organization_id AND id=NEW.promotion_id FOR UPDATE;
 IF promo.id IS NULL OR NOT promo.active OR now()<promo.valid_from OR now()>=promo.valid_until
  OR (promo.currency IS NOT NULL AND promo.currency<>NEW.currency) THEN
  RAISE EXCEPTION 'PROMOTION_UNAVAILABLE' USING ERRCODE='23514'; END IF;
 SELECT count(*),count(*) FILTER(WHERE guest_profile_id=NEW.guest_profile_id) INTO used_count,guest_count
 FROM public.promotion_redemptions WHERE organization_id=NEW.organization_id AND promotion_id=NEW.promotion_id;
 IF used_count>=promo.max_redemptions OR guest_count>=promo.per_guest_limit THEN
  RAISE EXCEPTION 'PROMOTION_LIMIT' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.validate_promotion_redemption() FROM PUBLIC;
CREATE TRIGGER promotion_redemptions_limit BEFORE INSERT ON promotion_redemptions FOR EACH ROW EXECUTE FUNCTION app.validate_promotion_redemption();
CREATE TRIGGER promotion_redemptions_immutable BEFORE UPDATE OR DELETE ON promotion_redemptions FOR EACH ROW EXECUTE FUNCTION app.registry_append_only();
CREATE TABLE loyalty_tiers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 code text NOT NULL, name jsonb NOT NULL CHECK(jsonb_typeof(name)='object'),
 completed_stays_required integer NOT NULL CHECK(completed_stays_required>=0),
 discount_bps integer NOT NULL CHECK(discount_bps BETWEEN 0 AND 10000),
 benefits jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(benefits)='object'),
 active boolean NOT NULL DEFAULT false,
 UNIQUE(organization_id,code), UNIQUE(organization_id,completed_stays_required), UNIQUE(organization_id,id)
);
CREATE TABLE loyalty_stay_credits (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, property_id uuid NOT NULL,
 guest_profile_id uuid NOT NULL, reservation_id uuid NOT NULL, currency char(3) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,guest_profile_id) REFERENCES guest_profiles(organization_id,id),
 FOREIGN KEY(organization_id,property_id,reservation_id,currency) REFERENCES reservations(organization_id,property_id,id,currency),
 UNIQUE(organization_id,reservation_id)
);
CREATE INDEX loyalty_stay_credits_guest_idx ON loyalty_stay_credits(organization_id,guest_profile_id,created_at);
CREATE FUNCTION app.validate_loyalty_stay() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 PERFORM 1 FROM public.reservations WHERE id=NEW.reservation_id AND organization_id=NEW.organization_id
  AND status='checked_out' AND check_out_at<=now() AND primary_guest_id=NEW.guest_profile_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'LOYALTY_STAY_INELIGIBLE' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER loyalty_stay_eligible BEFORE INSERT ON loyalty_stay_credits FOR EACH ROW EXECUTE FUNCTION app.validate_loyalty_stay();
CREATE TRIGGER loyalty_stay_immutable BEFORE UPDATE OR DELETE ON loyalty_stay_credits FOR EACH ROW EXECUTE FUNCTION app.registry_append_only();

DO $$ DECLARE tab text; read_permission text; write_permission text; BEGIN
 FOREACH tab IN ARRAY ARRAY['service_catalog','service_orders','promotion_codes','promotion_redemptions','loyalty_tiers','loyalty_stay_credits'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tab);
  IF tab IN ('promotion_codes','loyalty_tiers') THEN
   EXECUTE format('CREATE POLICY registry_read ON %I FOR SELECT USING(app.registry_access(organization_id,NULL,''property.read''))',tab);
   EXECUTE format('CREATE POLICY registry_insert ON %I FOR INSERT WITH CHECK(app.registry_access(organization_id,NULL,''property.manage''))',tab);
   EXECUTE format('CREATE POLICY registry_update ON %I FOR UPDATE USING(app.registry_access(organization_id,NULL,''property.manage'')) WITH CHECK(app.registry_access(organization_id,NULL,''property.manage''))',tab);
  ELSE
   read_permission := CASE WHEN tab='service_catalog' THEN 'property.read' ELSE 'reservation.read' END;
   write_permission := CASE WHEN tab='service_catalog' THEN 'property.manage' ELSE 'reservation.manage' END;
   EXECUTE format('CREATE POLICY registry_read ON %I FOR SELECT USING(app.registry_access(organization_id,property_id,%L))',tab,read_permission);
   EXECUTE format('CREATE POLICY registry_insert ON %I FOR INSERT WITH CHECK(app.registry_access(organization_id,property_id,%L))',tab,write_permission);
   IF tab IN ('service_catalog','service_orders') THEN
    EXECUTE format('CREATE POLICY registry_update ON %I FOR UPDATE USING(app.registry_access(organization_id,property_id,%L)) WITH CHECK(app.registry_access(organization_id,property_id,%L))',tab,write_permission,write_permission);
   END IF;
  END IF;
 END LOOP;
END $$;
COMMIT;
