BEGIN;
-- Append-only repair: preserve 0140 and existing function ownership/EXECUTE ACLs.
CREATE OR REPLACE FUNCTION app.partner_offer(session_hash text,key uuid,body jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o public.service_orders;c public.concierge_requests;g partner_private.grants;a partner_private.assignments;prior partner_private.commands;who uuid;expiry timestamptz;result jsonb;recovery boolean:=body->'recoveryOnly'='true'::jsonb;
BEGIN
 IF body ? 'recoveryOnly' AND body->'recoveryOnly' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'PARTNER_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 body:=body-'recoveryOnly';
 IF key IS NULL OR jsonb_typeof(body) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM ARRAY['expectedOrderRevision','expiresAt','grantId','orderId']
 OR jsonb_typeof(body->'expectedOrderRevision') IS DISTINCT FROM 'number' OR body->>'expectedOrderRevision' !~ '^[1-9][0-9]{0,8}$' THEN RAISE EXCEPTION 'PARTNER_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 SELECT * INTO o FROM public.service_orders WHERE id=(body->>'orderId')::uuid;
 IF o.id IS NULL THEN RAISE EXCEPTION 'PARTNER_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 who:=partner_private.staff_authorize(session_hash,o.organization_id,o.property_id);
 PERFORM pg_advisory_xact_lock(hashtextextended('partner:staff:'||who||':'||key,0));
 -- Same source lock as concierge; neither its state nor staff assignment is modified.
 SELECT * INTO c FROM public.concierge_requests WHERE order_id=o.id FOR UPDATE;
 IF c.order_id IS NULL THEN RAISE EXCEPTION 'PARTNER_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 PERFORM partner_private.staff_authorize(session_hash,o.organization_id,o.property_id);
 SELECT * INTO g FROM partner_private.grants WHERE id=(body->>'grantId')::uuid AND organization_id=o.organization_id AND property_id=o.property_id AND service_id=o.service_id;
 -- Historical staff receipts and recovery fences require scope, not current partner eligibility.
 IF g.id IS NULL THEN RAISE EXCEPTION 'PARTNER_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT * INTO prior FROM partner_private.commands WHERE actor_kind='staff' AND actor_id=who AND command_key=key;
 IF prior.command_key IS NOT NULL THEN
  IF prior.payload IS DISTINCT FROM body THEN RAISE EXCEPTION 'PARTNER_IDEMPOTENCY_CONFLICT' USING ERRCODE='23514'; END IF;
  IF prior.outcome='not_applied' THEN RETURN jsonb_build_object('outcome','not_applied','assignmentId',NULL,'synthetic',true,'idempotentReplay',true,'commandKey',key); END IF;
  SELECT * INTO a FROM partner_private.assignments WHERE id=prior.assignment_id;
  PERFORM partner_private.staff_authorize(session_hash,o.organization_id,o.property_id);
  IF prior.outcome='not_applied' THEN RETURN jsonb_build_object('outcome','not_applied','assignmentId',NULL,'synthetic',true,'idempotentReplay',true,'commandKey',key); END IF;
  RETURN partner_private.receipt(a)||jsonb_build_object('idempotentReplay',true,'outcome','applied','commandKey',key);
 END IF;
 IF recovery THEN
  INSERT INTO partner_private.commands(actor_kind,actor_id,command_key,payload,outcome) VALUES('staff',who,key,body,'not_applied');
  PERFORM partner_private.staff_authorize(session_hash,o.organization_id,o.property_id);
  RETURN jsonb_build_object('outcome','not_applied','assignmentId',NULL,'synthetic',true,'idempotentReplay',false,'commandKey',key);
 END IF;
 IF NOT g.active OR NOT EXISTS(SELECT 1 FROM partner_private.providers WHERE id=g.provider_id AND active) OR NOT EXISTS(SELECT 1 FROM public.service_catalog WHERE id=g.service_id AND active AND execution_kind='concierge') THEN RAISE EXCEPTION 'PARTNER_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF c.revision<>(body->>'expectedOrderRevision')::integer THEN RAISE EXCEPTION 'PARTNER_REVISION_CHANGED' USING ERRCODE='23514'; END IF;
 IF c.stage IN ('closed','cancelled') OR EXISTS(SELECT 1 FROM public.service_orders WHERE id=o.id AND status IN ('completed','cancelled')) THEN RAISE EXCEPTION 'PARTNER_TRANSITION_INVALID' USING ERRCODE='23514'; END IF;
 expiry:=(body->>'expiresAt')::timestamptz;
 IF expiry IS NULL OR expiry<=clock_timestamp() OR expiry>clock_timestamp()+interval '24 hours' THEN RAISE EXCEPTION 'PARTNER_EXPIRED' USING ERRCODE='23514'; END IF;
 UPDATE partner_private.assignments SET status='expired',revision=revision+1 WHERE order_id=o.id AND status='offered' AND expires_at<=clock_timestamp();
 IF EXISTS(SELECT 1 FROM partner_private.assignments WHERE order_id=o.id AND status IN ('offered','accepted')) THEN RAISE EXCEPTION 'PARTNER_ALREADY_ASSIGNED' USING ERRCODE='23514'; END IF;
 INSERT INTO partner_private.assignments(organization_id,property_id,order_id,grant_id,grant_version,source_revision,requested_for,expires_at)
 VALUES(o.organization_id,o.property_id,o.id,g.id,g.version,c.revision,o.requested_for,expiry) RETURNING * INTO a;
 PERFORM partner_private.staff_authorize(session_hash,o.organization_id,o.property_id);
 result:=partner_private.record('staff',who,key,body,a);
 PERFORM partner_private.staff_authorize(session_hash,o.organization_id,o.property_id);
 IF NOT EXISTS(SELECT 1 FROM partner_private.grants x JOIN partner_private.providers p ON p.id=x.provider_id JOIN public.service_catalog catalog ON catalog.id=x.service_id WHERE x.id=g.id AND x.active AND x.version=g.version AND p.active AND catalog.active AND catalog.execution_kind='concierge') THEN RAISE EXCEPTION 'PARTNER_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 RETURN result;
END $$;
COMMIT;
