BEGIN;
-- Review records are operational evidence, never authority to send/settle money.
CREATE TABLE payment_refund_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 property_id uuid NOT NULL,
 refund_request_id uuid NOT NULL REFERENCES payment_refund_requests(id),
 actor_user_id uuid NOT NULL REFERENCES users(id),
 actor_membership_id uuid NOT NULL REFERENCES organization_memberships(id),
 idempotency_key uuid NOT NULL,
 expected_revision text NOT NULL CHECK(expected_revision ~ '^[a-f0-9]{64}$'),
 observed_status text NOT NULL CHECK(observed_status IN ('pending','processing','submitted','uncertain','blocked','completed')),
 action text NOT NULL CHECK(action IN ('investigating','provider_contacted','evidence_requested')),
 case_reference text NOT NULL CHECK(case_reference ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,property_id) REFERENCES properties(organization_id,id),
 UNIQUE(organization_id,idempotency_key)
);
CREATE INDEX refund_reviews_request_idx ON payment_refund_reviews(organization_id,refund_request_id,created_at,id);
CREATE INDEX refund_reconciliation_queue_idx ON payment_refund_requests(organization_id,status,id);
CREATE FUNCTION app.validate_refund_review() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 PERFORM 1 FROM public.payment_refund_requests q
 JOIN public.payment_intents pi ON pi.id=q.payment_intent_id AND pi.organization_id=q.organization_id
 JOIN public.reservations r ON r.id=pi.reservation_id AND r.organization_id=pi.organization_id
 WHERE q.id=NEW.refund_request_id AND q.organization_id=NEW.organization_id
  AND r.property_id=NEW.property_id AND q.status=NEW.observed_status FOR SHARE OF q;
 IF NOT FOUND THEN RAISE EXCEPTION 'REFUND_REVIEW_SOURCE_MISMATCH' USING ERRCODE='23514'; END IF;
 NEW.created_at:=now();
 RETURN NEW;
END $$;
CREATE TRIGGER refund_review_source BEFORE INSERT ON payment_refund_reviews FOR EACH ROW EXECUTE FUNCTION app.validate_refund_review();
CREATE TRIGGER refund_review_immutable BEFORE UPDATE OR DELETE ON payment_refund_reviews FOR EACH ROW EXECUTE FUNCTION app.registry_append_only();
ALTER TABLE payment_refund_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_refund_reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY refund_review_read ON payment_refund_reviews FOR SELECT USING(app.registry_access(organization_id,property_id,'finance.read'));
CREATE POLICY refund_review_insert ON payment_refund_reviews FOR INSERT WITH CHECK(
 app.registry_access(organization_id,property_id,'finance.manage')
 AND actor_user_id=app.current_user_id() AND actor_membership_id=app.current_membership_id());
COMMIT;
