BEGIN;
CREATE TABLE guest_identity_private.hold_commands(
 user_id uuid NOT NULL REFERENCES public.users(id), command_key uuid NOT NULL,
 quote_id uuid NOT NULL REFERENCES public.booking_quotes(id), ttl_seconds integer NOT NULL CHECK(ttl_seconds BETWEEN 60 AND 900),
 reservation_id uuid NOT NULL UNIQUE REFERENCES public.reservations(id), PRIMARY KEY(user_id,command_key)
);
ALTER TABLE guest_identity_private.hold_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_identity_private.hold_commands FORCE ROW LEVEL SECURITY;
REVOKE ALL ON guest_identity_private.hold_commands FROM PUBLIC;
CREATE FUNCTION app.create_guest_hold(session_hash text,target uuid,command uuid,ttl integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE account_id uuid; live_id uuid; q public.booking_quotes; g public.guest_profiles;
 offer guest_identity_private.quote_offers; previous guest_identity_private.hold_commands;
 r public.reservations; key text; replay boolean:=false; configuration_ok boolean;
BEGIN
 IF target IS NULL OR command IS NULL OR ttl IS NULL OR ttl NOT BETWEEN 60 AND 900 THEN
  RAISE EXCEPTION 'GUEST_HOLD_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 SELECT guest_user_id INTO account_id FROM app.resolve_guest_identity(session_hash) WHERE session_expires_at>clock_timestamp();
 IF account_id IS NULL THEN RAISE EXCEPTION 'GUEST_SESSION_INVALID' USING ERRCODE='28000'; END IF;
 key:='guest-hold:'||account_id::text||':'||command::text;
 PERFORM pg_advisory_xact_lock(hashtextextended(key,0));
 SELECT * INTO q FROM public.booking_quotes WHERE id=target FOR UPDATE;
 SELECT * INTO offer FROM guest_identity_private.quote_offers WHERE quote_id=target;
 SELECT * INTO g FROM public.guest_profiles WHERE id=offer.profile_id AND organization_id=q.organization_id FOR SHARE;
 SELECT * INTO previous FROM guest_identity_private.hold_commands WHERE user_id=account_id AND command_key=command;
 IF previous.reservation_id IS NOT NULL THEN
  SELECT * INTO r FROM public.reservations WHERE id=previous.reservation_id FOR UPDATE;
 ELSE
  -- Keep active configuration stable until commit; no employee context is installed.
  SELECT true INTO configuration_ok FROM public.properties p
  JOIN public.units u ON u.property_id=p.id
  JOIN public.unit_types ut ON ut.id=u.unit_type_id AND ut.property_id=p.id
  JOIN public.rate_plans rp ON rp.property_id=p.id AND rp.unit_type_id=ut.id
  WHERE p.id=q.property_id AND p.organization_id=q.organization_id AND u.id=q.unit_id AND rp.id=q.rate_plan_id
   AND p.status='active' AND u.status='active' AND rp.active AND rp.currency=q.currency
  FOR SHARE OF p,u,ut,rp;
 END IF;
 -- Authorization follows every explicit waiting lock, including replay reservation locks.
 SELECT guest_user_id INTO live_id FROM app.resolve_guest_identity(session_hash) WHERE session_expires_at>clock_timestamp();
 IF live_id IS DISTINCT FROM account_id THEN RAISE EXCEPTION 'GUEST_SESSION_INVALID' USING ERRCODE='28000'; END IF;
 IF q.id IS NULL OR offer.user_id IS DISTINCT FROM account_id OR g.user_id IS DISTINCT FROM account_id THEN
  RAISE EXCEPTION 'GUEST_QUOTE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF previous.reservation_id IS NOT NULL THEN
  IF previous.quote_id<>target OR previous.ttl_seconds<>ttl THEN RAISE EXCEPTION 'GUEST_HOLD_CONFLICT' USING ERRCODE='23505'; END IF;
  IF r.id IS NULL OR r.organization_id<>q.organization_id OR r.primary_guest_id IS DISTINCT FROM g.id THEN
   RAISE EXCEPTION 'GUEST_QUOTE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF r.status<>'hold' OR r.hold_expires_at IS NULL OR r.hold_expires_at<=clock_timestamp() THEN
   RAISE EXCEPTION 'GUEST_HOLD_INACTIVE' USING ERRCODE='22023'; END IF;
  replay:=true;
 ELSE
  IF configuration_ok IS DISTINCT FROM true OR q.expires_at<=clock_timestamp() OR q.check_in_at<=clock_timestamp() THEN
   RAISE EXCEPTION 'GUEST_QUOTE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  INSERT INTO public.reservations(
   id,organization_id,property_id,unit_id,rate_plan_id,primary_guest_id,confirmation_code,status,
   check_in_at,check_out_at,currency,accommodation_minor,total_minor,cancellation_policy_snapshot,hold_expires_at,idempotency_key,quote_snapshot)
  VALUES(gen_random_uuid(),q.organization_id,q.property_id,q.unit_id,q.rate_plan_id,g.id,'VW-'||replace(gen_random_uuid()::text,'-',''),'hold',
   q.check_in_at,q.check_out_at,q.currency,q.accommodation_minor,q.total_minor,q.cancellation_policy_snapshot,
   clock_timestamp()+make_interval(secs=>ttl),key,
   jsonb_build_object('quoteId',q.id,'pricingSnapshot',q.pricing_snapshot,'guestContext',q.guest_context,
    'bookingChannel',q.booking_channel,'marketSegment',q.market_segment,'attributionSource',q.attribution_source)) RETURNING * INTO r;
  INSERT INTO public.reservation_price_lines(reservation_id,line_type,code,label,amount_minor,currency,refundable,metadata,tax_metadata,sort_order)
  SELECT r.id,line_type,code,label,amount_minor,currency,refundable,metadata,metadata,sort_order
   FROM public.booking_quote_lines WHERE quote_id=q.id ORDER BY sort_order,id;
  -- Existing EXCLUDE constraint is the final authority for every occupied period kind.
  INSERT INTO public.inventory_periods(organization_id,property_id,unit_id,kind,reservation_id,source_ref,stay_period,expires_at)
  VALUES(q.organization_id,q.property_id,q.unit_id,'payment_hold',r.id,key,tstzrange(q.check_in_at,q.check_out_at,'[)'),r.hold_expires_at);
  INSERT INTO public.booking_state_events(organization_id,reservation_id,event_type,to_status,actor_user_id,idempotency_key,payload)
  VALUES(q.organization_id,r.id,'booking.hold_created','hold',account_id,key,jsonb_build_object('quoteId',q.id,'holdExpiresAt',r.hold_expires_at));
  INSERT INTO public.outbox_events(organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload)
  VALUES(q.organization_id,'reservation',r.id,'booking.hold_created','outbox:'||key,jsonb_build_object('reservationId',r.id,'quoteId',q.id));
  INSERT INTO public.audit_log(organization_id,actor_user_id,action,entity_type,entity_id,after_state)
  VALUES(q.organization_id,account_id,'guest_hold.created','reservation',r.id,jsonb_build_object('quoteId',q.id));
  INSERT INTO guest_identity_private.hold_commands VALUES(account_id,command,target,ttl,r.id);
 END IF;
 -- EXCLUDE/FK/index insertions can also wait: a revoked session rolls the entire operation back.
 SELECT guest_user_id INTO live_id FROM app.resolve_guest_identity(session_hash) WHERE session_expires_at>clock_timestamp();
 IF live_id IS DISTINCT FROM account_id THEN RAISE EXCEPTION 'GUEST_SESSION_INVALID' USING ERRCODE='28000'; END IF;
 IF NOT replay AND (q.expires_at<=clock_timestamp() OR q.check_in_at<=clock_timestamp() OR r.hold_expires_at<=clock_timestamp()) THEN
  RAISE EXCEPTION 'GUEST_HOLD_INACTIVE' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('reservationId',r.id,'confirmationCode',r.confirmation_code,'status',r.status,
  'holdExpiresAt',r.hold_expires_at,'totalMinor',r.total_minor::text,'currency',r.currency,'idempotentReplay',replay);
END $$;
REVOKE ALL ON FUNCTION app.create_guest_hold(text,uuid,uuid,integer) FROM PUBLIC;
COMMIT;
