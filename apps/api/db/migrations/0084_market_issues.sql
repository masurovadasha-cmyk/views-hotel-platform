BEGIN;
ALTER TABLE public.market_orders ADD COLUMN issue jsonb;
ALTER FUNCTION service_private.market_act(text,uuid,uuid,jsonb,boolean) RENAME TO market_fulfilment_act;
CREATE FUNCTION service_private.market_act(session_hash text,oid uuid,key uuid,body jsonb,staff boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid; mid uuid; ord public.service_orders; m public.market_orders; stay public.reservations;
 action text:=body->>'action'; payload jsonb; prior jsonb; result jsonb;
BEGIN
 IF action NOT IN ('report_issue','answer_issue','confirm_receipt') OR action IS NULL THEN
  RETURN service_private.market_fulfilment_act(session_hash,oid,key,body,staff);
 END IF;
 IF staff THEN who:=service_private.staff_user(session_hash);mid:=app.current_membership_id();ELSE who:=service_private.guest_user(session_hash);END IF;
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR jsonb_typeof(body->'expectedRevision') IS DISTINCT FROM 'number' OR body->>'expectedRevision' !~ '^[1-9][0-9]*$' THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 IF action<>'confirm_receipt' AND ((SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM ARRAY['action','expectedRevision','note'] OR jsonb_typeof(body->'note') IS DISTINCT FROM 'string' OR length(btrim(body->>'note')) NOT BETWEEN 3 AND 1000) THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 SELECT o.* INTO ord FROM public.service_orders o JOIN public.market_orders linked ON linked.order_id=o.id WHERE o.id=oid;
 IF ord.id IS NULL THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002';END IF;
 IF staff THEN
  IF NOT app.registry_access(ord.organization_id,ord.property_id,'stock.manage') THEN RAISE EXCEPTION 'SERVICE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 ELSE
  PERFORM 1 FROM public.reservations r JOIN public.guest_profiles g ON g.id=r.primary_guest_id AND g.organization_id=r.organization_id WHERE r.id=ord.reservation_id AND g.user_id=who;
  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 END IF;
 payload:=jsonb_build_object('kind',CASE WHEN action='confirm_receipt' THEN 'market_action' ELSE 'market_issue' END,'staff',staff,'membershipId',mid,'orderId',oid,'body',body);
 prior:=service_private.service_command_replay(who,key,payload);IF prior IS NOT NULL THEN RETURN prior;END IF;
 SELECT * INTO stay FROM public.reservations WHERE id=ord.reservation_id FOR UPDATE;
 SELECT * INTO m FROM public.market_orders WHERE order_id=oid FOR UPDATE;
 IF staff THEN
  PERFORM service_private.staff_user(session_hash);
  IF NOT app.registry_access(ord.organization_id,ord.property_id,'stock.manage') THEN RAISE EXCEPTION 'SERVICE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 ELSE
  PERFORM service_private.guest_user(session_hash);
  PERFORM 1 FROM public.guest_profiles WHERE id=stay.primary_guest_id AND organization_id=stay.organization_id AND user_id=who FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 END IF;
 IF m.revision IS DISTINCT FROM (body->>'expectedRevision')::integer THEN RAISE EXCEPTION 'SERVICE_REVISION_CHANGED' USING ERRCODE='23514'; END IF;

 IF action='confirm_receipt' THEN
  IF m.issue->>'status'='open' THEN RAISE EXCEPTION 'SERVICE_TRANSITION_INVALID' USING ERRCODE='23514'; END IF;
  RETURN service_private.market_fulfilment_act(session_hash,oid,key,body,staff);
 ELSIF NOT staff AND action='report_issue' AND m.stage IN ('handed_over','completed') AND coalesce(m.issue->>'status','')<>'open' THEN
  UPDATE public.market_orders SET issue=jsonb_build_object('status','open','note',btrim(body->>'note'),'reportedAt',clock_timestamp()) WHERE order_id=oid;
 ELSIF staff AND action='answer_issue' AND m.issue->>'status'='open' THEN
  UPDATE public.market_orders SET issue=issue||jsonb_build_object('status','answered','answer',btrim(body->>'note'),'answeredAt',clock_timestamp()) WHERE order_id=oid;
 ELSE RAISE EXCEPTION 'SERVICE_TRANSITION_INVALID' USING ERRCODE='23514'; END IF;
 UPDATE public.market_orders SET revision=revision+1,updated_at=clock_timestamp() WHERE order_id=oid;
 result:=service_private.market_receipt(oid);
 PERFORM service_private.service_command_record(who,mid,key,payload,result,ord.organization_id,oid,'market.'||action);RETURN result;
END $$;
-- Rebind wrappers explicitly after renaming the old implementation.
CREATE OR REPLACE FUNCTION app.market_guest_act(session_hash text,oid uuid,key uuid,body jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT service_private.market_act(session_hash,oid,key,body,false) $$;
CREATE OR REPLACE FUNCTION app.market_staff_act(session_hash text,oid uuid,key uuid,body jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT service_private.market_act(session_hash,oid,key,body,true) $$;
CREATE OR REPLACE FUNCTION service_private.market_receipt(oid uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('orderId',o.id,'stage',m.stage,'revision',m.revision,'currency',o.currency,'totalMinor',o.total_minor::text,'requestedFor',o.requested_for,'lines',o.snapshot->'lines','issue',m.issue,'idempotentReplay',false)
 FROM public.service_orders o JOIN public.market_orders m ON m.order_id=o.id WHERE o.id=oid
$$;

REVOKE ALL ON FUNCTION service_private.market_act(text,uuid,uuid,jsonb,boolean),service_private.market_fulfilment_act(text,uuid,uuid,jsonb,boolean) FROM PUBLIC;
COMMIT;
