BEGIN;
CREATE FUNCTION app.demo_payment_owner(session_hash text,target uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE account_id uuid; org uuid;
BEGIN
 IF shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') IS DISTINCT FROM 'VIEWS_DISPOSABLE_CORE_TEST' THEN
  RAISE EXCEPTION 'DEMO_PAYMENT_DISABLED' USING ERRCODE='42501'; END IF;
 SELECT guest_user_id INTO account_id FROM app.resolve_guest_identity(session_hash) WHERE session_expires_at>clock_timestamp();
 IF account_id IS NULL THEN RAISE EXCEPTION 'GUEST_SESSION_INVALID' USING ERRCODE='28000'; END IF;
 SELECT r.organization_id INTO org FROM public.reservations r JOIN public.guest_profiles g
  ON g.id=r.primary_guest_id AND g.organization_id=r.organization_id AND g.user_id=account_id
 JOIN guest_identity_private.hold_commands h ON h.reservation_id=r.id AND h.user_id=account_id WHERE r.id=target;
 IF org IS NULL THEN RAISE EXCEPTION 'DEMO_BOOKING_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 RETURN org;
END $$;
CREATE FUNCTION app.prepare_guest_demo_payment(session_hash text,target uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE org uuid; r public.reservations; pi public.payment_intents; profile uuid;
BEGIN
 org:=app.demo_payment_owner(session_hash,target);
 PERFORM pg_advisory_xact_lock(hashtextextended('demo-payment:'||target::text,0));
 SELECT primary_guest_id INTO profile FROM public.reservations WHERE id=target;
 PERFORM 1 FROM public.guest_profiles WHERE id=profile FOR SHARE;
 SELECT * INTO pi FROM public.payment_intents WHERE organization_id=org AND idempotency_key='demo:'||target::text FOR UPDATE;
 SELECT * INTO r FROM public.reservations WHERE id=target FOR UPDATE;
 IF app.demo_payment_owner(session_hash,target) IS DISTINCT FROM org OR r.primary_guest_id IS DISTINCT FROM profile THEN
  RAISE EXCEPTION 'DEMO_BOOKING_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF EXISTS(SELECT 1 FROM public.payment_intents WHERE reservation_id=target AND (provider<>'demo' OR id IS DISTINCT FROM pi.id)) THEN
  RAISE EXCEPTION 'DEMO_PAYMENT_CONFLICT' USING ERRCODE='22023'; END IF;
 IF pi.id IS NULL THEN
  IF r.status<>'hold' OR r.hold_expires_at IS NULL OR r.hold_expires_at<=clock_timestamp() OR r.total_minor<=0 THEN
   RAISE EXCEPTION 'DEMO_HOLD_INACTIVE' USING ERRCODE='22023'; END IF;
  INSERT INTO public.payment_intents(organization_id,reservation_id,quote_id,provider,amount_minor,currency,idempotency_key,expires_at)
  VALUES(org,target,(r.quote_snapshot->>'quoteId')::uuid,'demo',r.total_minor,r.currency,'demo:'||target::text,r.hold_expires_at) RETURNING * INTO pi;
 ELSE
  IF pi.provider<>'demo' OR pi.reservation_id<>target OR pi.status NOT IN ('captured','refund_pending') THEN
   RAISE EXCEPTION 'DEMO_PAYMENT_CONFLICT' USING ERRCODE='22023'; END IF;
 END IF;
 RETURN jsonb_build_object('id',pi.id,'organizationId',org,'amountMinor',pi.amount_minor::text,'currency',pi.currency,'occurredAt',pi.created_at);
END $$;
REVOKE ALL ON FUNCTION app.demo_payment_owner(text,uuid),app.prepare_guest_demo_payment(text,uuid) FROM PUBLIC;
COMMIT;
