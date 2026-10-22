BEGIN;
CREATE TABLE booking_cancellations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, property_id uuid NOT NULL,
 reservation_id uuid NOT NULL, currency char(3) NOT NULL,
 requested_at timestamptz NOT NULL,
 policy_snapshot jsonb NOT NULL CHECK(jsonb_typeof(policy_snapshot)='object'),
 price_total_minor bigint NOT NULL CHECK(price_total_minor>=0),
 penalty_minor bigint NOT NULL CHECK(penalty_minor>=0 AND penalty_minor<=price_total_minor),
 net_collected_minor bigint NOT NULL CHECK(net_collected_minor>=0),
 refund_minor bigint NOT NULL CHECK(refund_minor>=0 AND refund_minor<=net_collected_minor),
 idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 160),
 actor_user_id uuid NOT NULL REFERENCES users(id),
 actor_membership_id uuid NOT NULL REFERENCES organization_memberships(id),
 FOREIGN KEY(organization_id,property_id,reservation_id,currency) REFERENCES reservations(organization_id,property_id,id,currency),
 UNIQUE(organization_id,reservation_id), UNIQUE(organization_id,idempotency_key),
 UNIQUE(organization_id,id)
);
CREATE INDEX booking_cancellations_property_idx ON booking_cancellations(organization_id,property_id,requested_at,id);
CREATE TABLE cancellation_capture_limits (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
 cancellation_id uuid NOT NULL, provider_transaction_id uuid NOT NULL REFERENCES provider_transactions(id),
 refund_limit_minor bigint NOT NULL CHECK(refund_limit_minor>=0),
 reclassification_minor bigint NOT NULL CHECK(reclassification_minor>=0 AND reclassification_minor<=refund_limit_minor),
 FOREIGN KEY(organization_id,cancellation_id) REFERENCES booking_cancellations(organization_id,id),
 UNIQUE(provider_transaction_id)
);
CREATE FUNCTION app.validate_cancellation_capture_limit() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 PERFORM 1 FROM public.provider_transactions t
 JOIN public.payment_intents pi ON pi.id=t.payment_intent_id AND pi.organization_id=t.organization_id
 JOIN public.booking_cancellations bc ON bc.id=NEW.cancellation_id AND bc.organization_id=NEW.organization_id
 WHERE t.id=NEW.provider_transaction_id AND t.organization_id=NEW.organization_id AND t.kind='capture'
  AND pi.reservation_id=bc.reservation_id AND t.currency=bc.currency AND NEW.refund_limit_minor<=t.amount_minor;
 IF NOT FOUND THEN RAISE EXCEPTION 'CANCELLATION_CAPTURE_MISMATCH' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER cancellation_limit_check BEFORE INSERT ON cancellation_capture_limits FOR EACH ROW EXECUTE FUNCTION app.validate_cancellation_capture_limit();
CREATE TRIGGER cancellation_immutable BEFORE UPDATE OR DELETE ON booking_cancellations FOR EACH ROW EXECUTE FUNCTION app.registry_append_only();
CREATE TRIGGER cancellation_limit_immutable BEFORE UPDATE OR DELETE ON cancellation_capture_limits FOR EACH ROW EXECUTE FUNCTION app.registry_append_only();
ALTER TABLE booking_cancellations ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_cancellations FORCE ROW LEVEL SECURITY;
ALTER TABLE cancellation_capture_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE cancellation_capture_limits FORCE ROW LEVEL SECURITY;
-- Org-only read is reserved for existing internal recovery jobs with no staff
-- actor; staff requests require the bound active identity and property scope.
CREATE POLICY cancellation_read ON booking_cancellations FOR SELECT USING(
 organization_id=app.current_organization_id() AND
 (app.current_membership_id() IS NULL OR app.registry_access(organization_id,property_id,'reservation.read')));
CREATE POLICY cancellation_insert ON booking_cancellations FOR INSERT WITH CHECK(
 app.registry_access(organization_id,property_id,'reservation.manage') AND actor_user_id=app.current_user_id() AND actor_membership_id=app.current_membership_id());
CREATE POLICY cancellation_limits_read ON cancellation_capture_limits FOR SELECT USING(
 organization_id=app.current_organization_id() AND EXISTS(SELECT 1 FROM booking_cancellations b WHERE b.id=cancellation_id));
CREATE POLICY cancellation_limits_insert ON cancellation_capture_limits FOR INSERT WITH CHECK(
 organization_id=app.current_organization_id() AND EXISTS(SELECT 1 FROM booking_cancellations b WHERE b.id=cancellation_id AND app.registry_access(b.organization_id,b.property_id,'reservation.manage')));
COMMIT;
