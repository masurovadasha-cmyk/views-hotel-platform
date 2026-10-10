BEGIN;
-- Guest cancellation is an explicit authenticated actor, never a staff membership.
ALTER TABLE public.booking_cancellations ALTER COLUMN actor_membership_id DROP NOT NULL;
ALTER TABLE public.booking_cancellations ADD COLUMN actor_kind text NOT NULL DEFAULT 'staff' CHECK(actor_kind IN ('staff','guest'));
ALTER TABLE public.booking_cancellations ADD CONSTRAINT cancellation_actor_kind_check CHECK((actor_kind='staff' AND actor_membership_id IS NOT NULL) OR (actor_kind='guest' AND actor_membership_id IS NULL));
CREATE TABLE guest_identity_private.cancellation_quotes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES public.users(id),
 reservation_id uuid NOT NULL REFERENCES public.reservations(id), fingerprint jsonb NOT NULL,
 calculation jsonb NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX guest_cancellation_quotes_account_idx ON guest_identity_private.cancellation_quotes(account_id,reservation_id,created_at);
CREATE TABLE guest_identity_private.cancellation_commands(
 account_id uuid NOT NULL REFERENCES public.users(id), command_key uuid NOT NULL,
 reservation_id uuid NOT NULL REFERENCES public.reservations(id), quote_id uuid NOT NULL REFERENCES guest_identity_private.cancellation_quotes(id),
 result jsonb NOT NULL, PRIMARY KEY(account_id,command_key)
);
ALTER TABLE guest_identity_private.cancellation_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_identity_private.cancellation_quotes FORCE ROW LEVEL SECURITY;
ALTER TABLE guest_identity_private.cancellation_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_identity_private.cancellation_commands FORCE ROW LEVEL SECURITY;
REVOKE ALL ON guest_identity_private.cancellation_quotes,guest_identity_private.cancellation_commands FROM PUBLIC;
CREATE FUNCTION app.guest_cancellation_scope(session_hash text,target uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE org uuid;
BEGIN
 PERFORM 1 FROM app.guest_email_trips(session_hash,NULL,NULL,target);
 IF NOT FOUND THEN RAISE EXCEPTION 'GUEST_TRIP_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT organization_id INTO org FROM public.reservations WHERE id=target;
 RETURN org;
END $$;
CREATE FUNCTION app.guest_cancellation_state(session_hash text,target uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r public.reservations; account uuid; state jsonb;
BEGIN
 SELECT guest_user_id INTO account FROM app.resolve_guest_email_identity(session_hash);
 IF account IS NULL THEN RAISE EXCEPTION 'GUEST_EMAIL_SESSION_INVALID' USING ERRCODE='28000'; END IF;
 PERFORM app.guest_cancellation_scope(session_hash,target);
 -- Match captured-payment webhook lock order. Ownership is rechecked after locks.
 PERFORM 1 FROM public.payment_intents WHERE reservation_id=target ORDER BY id FOR UPDATE;
 SELECT * INTO r FROM public.reservations WHERE id=target FOR UPDATE;
 PERFORM 1 FROM public.guest_profiles WHERE id=r.primary_guest_id FOR UPDATE;
 PERFORM app.guest_cancellation_scope(session_hash,target);
 state=jsonb_build_object('organizationId',r.organization_id,'accountId',account,'reservationId',r.id,'propertyId',r.property_id,
  'primaryGuestId',r.primary_guest_id,'unitId',r.unit_id,'status',r.status,'currency',r.currency,'totalMinor',r.total_minor::text,'version',r.version,
  'checkInAt',r.check_in_at,'policy',r.cancellation_policy_snapshot,
  'periods',(SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.id),'[]') FROM public.inventory_periods p WHERE p.reservation_id=target),
  'lines',(SELECT COALESCE(jsonb_agg(jsonb_build_object('code',l.code,'amountMinor',l.amount_minor::text,'refundable',l.refundable,'currency',l.currency) ORDER BY l.sort_order,l.id),'[]') FROM public.reservation_price_lines l WHERE l.reservation_id=target),
  'intents',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',p.id,'organizationId',p.organization_id,'provider',p.provider,'currency',p.currency,'capturedMinor',p.captured_minor::text,'refundedMinor',p.refunded_minor::text,'version',p.version) ORDER BY p.id),'[]') FROM public.payment_intents p WHERE p.reservation_id=target),
  'captures',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',t.id,'organizationId',t.organization_id,'paymentIntentId',t.payment_intent_id,'currency',t.currency,'capturedMinor',t.amount_minor::text,'refundedMinor',COALESCE((SELECT sum(x.amount_minor) FROM public.provider_transactions x WHERE x.payment_intent_id=t.payment_intent_id AND x.kind='refund' AND x.related_external_transaction_id=t.external_transaction_id),0)::text) ORDER BY t.occurred_at,t.id),'[]') FROM public.provider_transactions t JOIN public.payment_intents p ON p.id=t.payment_intent_id AND p.organization_id=t.organization_id WHERE p.reservation_id=target AND t.kind='capture'),
  'hasRefundRequests',EXISTS(SELECT 1 FROM public.payment_refund_requests q JOIN public.payment_intents p ON p.id=q.payment_intent_id WHERE p.reservation_id=target),
  'finalized',EXISTS(SELECT 1 FROM public.reservation_economic_snapshots e WHERE e.reservation_id=target AND e.status='finalized'));
 RETURN jsonb_build_object('fingerprint',state,'requestedAt',clock_timestamp());
END $$;
-- Independently recompute the financial contract before accepting backend input.
CREATE FUNCTION guest_identity_private.cancellation_calculation(s jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p jsonb=s->'policy'; rule jsonb; line jsonb; cap jsonb; intent jsonb;
 total numeric=(s->>'totalMinor')::numeric; eligible numeric=0; lines_total numeric=0;
 collected numeric=0; policy_refund numeric; penalty numeric; refund numeric; remaining numeric; amount numeric;
 bps integer=0; hours numeric; limits jsonb='[]';
BEGIN
 IF s->>'status'<>'confirmed' OR (s->>'checkInAt')::timestamptz<=clock_timestamp() THEN RAISE EXCEPTION 'GUEST_CANCELLATION_NOT_AVAILABLE' USING ERRCODE='40001'; END IF;
 IF (s->>'hasRefundRequests')::boolean OR (s->>'finalized')::boolean OR jsonb_array_length(s->'periods')<>1 OR s#>>'{periods,0,kind}'<>'reservation' OR s#>>'{periods,0,property_id}' IS DISTINCT FROM s->>'propertyId' OR s#>>'{periods,0,organization_id}' IS DISTINCT FROM s->>'organizationId' OR s#>>'{periods,0,unit_id}' IS DISTINCT FROM s->>'unitId' THEN RAISE EXCEPTION 'GUEST_CANCELLATION_RECONCILIATION_REQUIRED' USING ERRCODE='40001'; END IF;
 IF p->>'version' IS DISTINCT FROM '1' OR jsonb_typeof(p->'rules') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'rules')=0 OR jsonb_typeof(p->'nonRefundableLineCodes') IS DISTINCT FROM 'array' OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p->>'propertyTimezone') THEN RAISE EXCEPTION 'GUEST_CANCELLATION_RECONCILIATION_REQUIRED' USING ERRCODE='40001'; END IF;
 hours=extract(epoch FROM ((s->>'checkInAt')::timestamptz-clock_timestamp()))/3600;
 FOR rule IN SELECT value FROM jsonb_array_elements(p->'rules') LOOP
  IF jsonb_typeof(rule->'refundBps') IS DISTINCT FROM 'number' OR jsonb_typeof(rule->'minHoursBeforeCheckIn') IS DISTINCT FROM 'number' OR (rule->>'refundBps')::numeric<>trunc((rule->>'refundBps')::numeric) OR (rule->>'refundBps')::numeric NOT BETWEEN 0 AND 10000 OR (rule->>'minHoursBeforeCheckIn')::numeric<0 THEN RAISE EXCEPTION 'GUEST_CANCELLATION_RECONCILIATION_REQUIRED' USING ERRCODE='40001'; END IF;
 END LOOP;
 SELECT COALESCE((value->>'refundBps')::integer,0) INTO bps FROM jsonb_array_elements(p->'rules') WITH ORDINALITY rules(value,n) WHERE hours>=(value->>'minHoursBeforeCheckIn')::numeric ORDER BY (value->>'minHoursBeforeCheckIn')::numeric DESC,n LIMIT 1;
 bps=COALESCE(bps,0);
 FOR line IN SELECT value FROM jsonb_array_elements(s->'lines') LOOP
  IF line->>'currency' IS DISTINCT FROM s->>'currency' THEN RAISE EXCEPTION 'GUEST_CANCELLATION_RECONCILIATION_REQUIRED' USING ERRCODE='40001'; END IF;
  lines_total=lines_total+(line->>'amountMinor')::numeric;
  IF (line->>'refundable')::boolean AND NOT (p->'nonRefundableLineCodes' ? (line->>'code')) THEN eligible=eligible+(line->>'amountMinor')::numeric; END IF;
 END LOOP;
 IF total<0 OR lines_total<>total OR eligible<0 OR eligible>total THEN RAISE EXCEPTION 'GUEST_CANCELLATION_RECONCILIATION_REQUIRED' USING ERRCODE='40001'; END IF;
 FOR intent IN SELECT value FROM jsonb_array_elements(s->'intents') LOOP
  IF intent->>'organizationId' IS DISTINCT FROM s->>'organizationId' OR intent->>'currency'<>s->>'currency' OR (SELECT COALESCE(sum((value->>'capturedMinor')::numeric),0) FROM jsonb_array_elements(s->'captures') WHERE value->>'paymentIntentId'=intent->>'id')<>(intent->>'capturedMinor')::numeric OR (SELECT COALESCE(sum((value->>'refundedMinor')::numeric),0) FROM jsonb_array_elements(s->'captures') WHERE value->>'paymentIntentId'=intent->>'id')<>(intent->>'refundedMinor')::numeric THEN RAISE EXCEPTION 'GUEST_CANCELLATION_RECONCILIATION_REQUIRED' USING ERRCODE='40001'; END IF;
 END LOOP;
 FOR cap IN SELECT value FROM jsonb_array_elements(s->'captures') LOOP
  IF cap->>'organizationId' IS DISTINCT FROM s->>'organizationId' OR cap->>'currency'<>s->>'currency' OR (cap->>'capturedMinor')::numeric<0 OR (cap->>'refundedMinor')::numeric<0 OR (cap->>'refundedMinor')::numeric>(cap->>'capturedMinor')::numeric THEN RAISE EXCEPTION 'GUEST_CANCELLATION_RECONCILIATION_REQUIRED' USING ERRCODE='40001'; END IF;
  collected=collected+(cap->>'capturedMinor')::numeric-(cap->>'refundedMinor')::numeric;
 END LOOP;
 IF collected>total THEN RAISE EXCEPTION 'GUEST_CANCELLATION_RECONCILIATION_REQUIRED' USING ERRCODE='40001'; END IF;
 policy_refund=floor(eligible*bps/10000); penalty=total-policy_refund; refund=greatest(collected-penalty,0); remaining=refund;
 FOR cap IN SELECT value FROM jsonb_array_elements(s->'captures') LOOP
  amount=least(remaining,(cap->>'capturedMinor')::numeric-(cap->>'refundedMinor')::numeric); remaining=remaining-amount;
  limits=limits||jsonb_build_array(jsonb_build_object('id',cap->>'id','refundLimitMinor',((cap->>'refundedMinor')::numeric+amount)::bigint::text,'reclassificationMinor',amount::bigint::text));
 END LOOP;
 RETURN jsonb_build_object('penaltyMinor',penalty::bigint::text,'netCollectedMinor',collected::bigint::text,'refundMinor',refund::bigint::text,'refundBps',bps,'limits',limits);
END $$;
REVOKE ALL ON FUNCTION guest_identity_private.cancellation_calculation(jsonb) FROM PUBLIC;
-- The existing TS recovery must complete in the same transaction. A direct
-- definer call cannot commit a paid cancellation without the refund liability.
CREATE FUNCTION guest_identity_private.require_cancellation_recovery() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE lim record;
BEGIN
 IF NEW.actor_kind<>'guest' THEN RETURN NULL; END IF;
 FOR lim IN SELECT l.*,t.payment_intent_id,t.external_transaction_id,pi.provider FROM public.cancellation_capture_limits l JOIN public.provider_transactions t ON t.id=l.provider_transaction_id JOIN public.payment_intents pi ON pi.id=t.payment_intent_id WHERE l.cancellation_id=NEW.id AND l.reclassification_minor>0 LOOP
  IF NOT EXISTS(SELECT 1 FROM public.payment_refund_requests r WHERE r.organization_id=NEW.organization_id AND r.payment_intent_id=lim.payment_intent_id AND r.external_capture_id=lim.external_transaction_id AND r.amount_minor=lim.reclassification_minor AND r.currency=NEW.currency AND r.liability_account_code='refunds_payable') OR NOT EXISTS(
   SELECT 1 FROM public.ledger_journals j WHERE j.organization_id=NEW.organization_id AND j.idempotency_key='refund-reclassify:'||lim.provider||':'||lim.external_transaction_id AND j.status='posted' AND j.reference_type='payment_intent' AND j.reference_id=lim.payment_intent_id
    AND (SELECT count(*) FROM public.ledger_entries e WHERE e.journal_id=j.id)=2
    AND EXISTS(SELECT 1 FROM public.ledger_entries e JOIN public.ledger_accounts a ON a.id=e.account_id WHERE e.journal_id=j.id AND e.side='debit' AND a.code='guest_deposits' AND e.amount_minor=lim.reclassification_minor AND e.currency=NEW.currency)
    AND EXISTS(SELECT 1 FROM public.ledger_entries e JOIN public.ledger_accounts a ON a.id=e.account_id WHERE e.journal_id=j.id AND e.side='credit' AND a.code='refunds_payable' AND e.amount_minor=lim.reclassification_minor AND e.currency=NEW.currency)) THEN RAISE EXCEPTION 'GUEST_CANCELLATION_RECOVERY_REQUIRED' USING ERRCODE='23514'; END IF;
 END LOOP;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION guest_identity_private.require_cancellation_recovery() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER guest_cancellation_recovery AFTER INSERT ON public.booking_cancellations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guest_identity_private.require_cancellation_recovery();
CREATE FUNCTION app.guest_cancellation_quote(session_hash text,target uuid,expected jsonb,calculation jsonb,valid_until timestamptz) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE state jsonb; quote uuid;
BEGIN
 state=app.guest_cancellation_state(session_hash,target)->'fingerprint';
 IF calculation IS DISTINCT FROM guest_identity_private.cancellation_calculation(state) THEN RAISE EXCEPTION 'GUEST_CANCELLATION_QUOTE_STALE' USING ERRCODE='40001'; END IF;
 IF expected IS NULL OR calculation IS NULL OR valid_until IS NULL OR state IS DISTINCT FROM expected OR valid_until<=clock_timestamp() OR valid_until>clock_timestamp()+interval '5 minutes' THEN RAISE EXCEPTION 'GUEST_CANCELLATION_QUOTE_STALE' USING ERRCODE='40001'; END IF;
 INSERT INTO guest_identity_private.cancellation_quotes(account_id,reservation_id,fingerprint,calculation,expires_at)
 VALUES((state->>'accountId')::uuid,target,state,calculation,valid_until) RETURNING id INTO quote;
 RETURN quote;
END $$;
CREATE FUNCTION app.guest_cancellation_replay(session_hash text,target uuid,quote uuid,command uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE account uuid; prior guest_identity_private.cancellation_commands;
BEGIN
 PERFORM app.guest_cancellation_scope(session_hash,target);
 SELECT guest_user_id INTO account FROM app.resolve_guest_email_identity(session_hash);
 PERFORM pg_advisory_xact_lock(hashtextextended('guest-cancel:'||account::text||':'||command::text,0));
 SELECT * INTO prior FROM guest_identity_private.cancellation_commands WHERE account_id=account AND command_key=command;
 IF FOUND THEN
  IF prior.reservation_id<>target OR prior.quote_id<>quote THEN RAISE EXCEPTION 'GUEST_CANCELLATION_COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN prior.result||jsonb_build_object('idempotentReplay',true);
 END IF;
 RETURN NULL;
END $$;
CREATE FUNCTION app.guest_cancellation_commit(session_hash text,target uuid,quote uuid,command uuid,expected jsonb,calculated jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE state jsonb; q guest_identity_private.cancellation_quotes; org uuid; account uuid; cancel_id uuid=gen_random_uuid(); result jsonb; lim jsonb; prior jsonb;
BEGIN
 state=app.guest_cancellation_state(session_hash,target)->'fingerprint';
 prior=app.guest_cancellation_replay(session_hash,target,quote,command); IF prior IS NOT NULL THEN RETURN prior; END IF;
 account=(state->>'accountId')::uuid; org=(state->>'organizationId')::uuid;
 SELECT * INTO q FROM guest_identity_private.cancellation_quotes WHERE id=quote AND account_id=account AND reservation_id=target;
 IF NOT FOUND OR q.expires_at<=clock_timestamp() OR state IS DISTINCT FROM expected OR state IS DISTINCT FROM q.fingerprint OR calculated IS DISTINCT FROM q.calculation OR calculated IS DISTINCT FROM guest_identity_private.cancellation_calculation(state) THEN RAISE EXCEPTION 'GUEST_CANCELLATION_QUOTE_STALE' USING ERRCODE='40001'; END IF;
 INSERT INTO public.booking_cancellations(id,organization_id,property_id,reservation_id,currency,requested_at,policy_snapshot,price_total_minor,penalty_minor,net_collected_minor,refund_minor,idempotency_key,actor_user_id,actor_membership_id,actor_kind)
 VALUES(cancel_id,org,(state->>'propertyId')::uuid,target,state->>'currency',clock_timestamp(),state->'policy',(state->>'totalMinor')::bigint,(calculated->>'penaltyMinor')::bigint,(calculated->>'netCollectedMinor')::bigint,(calculated->>'refundMinor')::bigint,'guest:'||account::text||':'||command::text,account,NULL,'guest');
 FOR lim IN SELECT * FROM jsonb_array_elements(calculated->'limits') LOOP
  INSERT INTO public.cancellation_capture_limits(organization_id,cancellation_id,provider_transaction_id,refund_limit_minor,reclassification_minor)
  VALUES(org,cancel_id,(lim->>'id')::uuid,(lim->>'refundLimitMinor')::bigint,(lim->>'reclassificationMinor')::bigint);
 END LOOP;
 DELETE FROM public.inventory_periods WHERE reservation_id=target AND kind='reservation';
 UPDATE public.reservations SET status='cancelled',cancelled_at=clock_timestamp(),updated_at=clock_timestamp(),version=version+1 WHERE id=target;
 result=jsonb_build_object('cancellationId',cancel_id,'reservationId',target,'currency',state->>'currency','status','cancelled','refundMinor',calculated->>'refundMinor','penaltyMinor',calculated->>'penaltyMinor','refundStatus',CASE WHEN (calculated->>'refundMinor')::bigint>0 THEN 'pending' ELSE 'not_required' END,'idempotentReplay',false);
 INSERT INTO public.booking_state_events(organization_id,reservation_id,event_type,from_status,to_status,actor_user_id,idempotency_key,payload) VALUES(org,target,'booking.policy_cancelled','confirmed','cancelled',account,'guest:'||account::text||':'||command::text,result);
 INSERT INTO public.audit_log(organization_id,actor_user_id,action,entity_type,entity_id,after_state) VALUES(org,account,'guest.booking_cancelled','reservation',target,result);
 INSERT INTO public.outbox_events(organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload) VALUES(org,'reservation',target,'booking.cancelled','guest-policy-cancel:'||cancel_id::text,result);
 INSERT INTO guest_identity_private.cancellation_commands VALUES(account,command,target,quote,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION app.guest_cancellation_scope(text,uuid),app.guest_cancellation_state(text,uuid),app.guest_cancellation_quote(text,uuid,jsonb,jsonb,timestamptz),app.guest_cancellation_replay(text,uuid,uuid,uuid),app.guest_cancellation_commit(text,uuid,uuid,uuid,jsonb,jsonb) FROM PUBLIC;
COMMIT;
