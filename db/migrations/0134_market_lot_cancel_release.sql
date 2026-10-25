BEGIN;
-- M1 only: cancellation releases private lot holds under the existing order/item locks.
-- Reserve activation, replacement and handover remain unchanged and gated.
CREATE OR REPLACE FUNCTION service_private.market_cancel(session_hash text,oid uuid,key uuid,body jsonb,staff boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid; mid uuid; ord public.service_orders; m public.market_orders; stay public.reservations;
 action text:=body->>'action'; payload jsonb; prior jsonb; result jsonb;
BEGIN
 IF staff THEN who:=service_private.staff_user(session_hash);mid:=app.current_membership_id();ELSE who:=service_private.guest_user(session_hash);END IF;
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR action IS NULL OR jsonb_typeof(body->'expectedRevision') IS DISTINCT FROM 'number' OR body->>'expectedRevision' !~ '^[1-9][0-9]*$' THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 IF action IS DISTINCT FROM 'cancel' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM ARRAY['action','expectedRevision'] THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023';END IF;
 SELECT o.* INTO ord FROM public.service_orders o JOIN public.market_orders linked ON linked.order_id=o.id WHERE o.id=oid;
 IF ord.id IS NULL THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002';END IF;
 IF staff THEN
  IF NOT app.registry_access(ord.organization_id,ord.property_id,'stock.manage') THEN RAISE EXCEPTION 'SERVICE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 ELSE
  PERFORM 1 FROM public.reservations r JOIN public.guest_profiles g ON g.id=r.primary_guest_id AND g.organization_id=r.organization_id WHERE r.id=ord.reservation_id AND g.user_id=who;
  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 END IF;
 payload:=jsonb_build_object('kind','market_action','staff',staff,'membershipId',mid,'orderId',oid,'body',body);
 PERFORM pg_advisory_xact_lock(hashtextextended('service:'||who||':'||key,0));
 SELECT * INTO stay FROM public.reservations WHERE id=ord.reservation_id FOR UPDATE;
 SELECT * INTO m FROM public.market_orders WHERE order_id=oid FOR UPDATE;
 IF staff THEN
  PERFORM service_private.staff_user(session_hash);
  IF NOT app.registry_access(ord.organization_id,ord.property_id,'stock.manage') THEN RAISE EXCEPTION 'SERVICE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 ELSE
  PERFORM 1 FROM public.guest_profiles WHERE id=stay.primary_guest_id AND organization_id=stay.organization_id AND user_id=who FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 END IF;
 IF NOT staff THEN PERFORM service_private.guest_user(session_hash);END IF;
 prior:=service_private.service_command_replay(who,key,payload);IF prior IS NOT NULL THEN RETURN prior;END IF;
 IF m.revision IS DISTINCT FROM (body->>'expectedRevision')::integer THEN RAISE EXCEPTION 'SERVICE_REVISION_CHANGED' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM public.supply_items i JOIN public.market_order_lines held ON held.item_id=i.id WHERE held.order_id=oid ORDER BY i.id FOR UPDATE OF i;
 IF staff THEN
  PERFORM service_private.staff_user(session_hash);
  IF NOT app.registry_access(ord.organization_id,ord.property_id,'stock.manage') THEN RAISE EXCEPTION 'SERVICE_FORBIDDEN' USING ERRCODE='42501';END IF;
 ELSE PERFORM service_private.guest_user(session_hash);END IF;
 IF NOT(m.stage='reserved' OR staff AND m.stage IN ('picking','ready')) THEN RAISE EXCEPTION 'SERVICE_TRANSITION_INVALID' USING ERRCODE='23514';END IF;
 -- Release only this order in the same transaction as its terminal transition.
 -- Rows are immutable history; rollback restores every hold if any later check fails.
 UPDATE public.market_lot_reservations SET released_at=clock_timestamp()
  WHERE order_id=oid AND organization_id=ord.organization_id AND property_id=ord.property_id AND released_at IS NULL;
 UPDATE public.market_orders SET stage='cancelled' WHERE order_id=oid;
 UPDATE public.service_orders SET status='cancelled' WHERE id=oid;
 -- A late order-row wait must not allow revoked credentials to commit cancellation.
 IF staff THEN
  PERFORM service_private.staff_user(session_hash);
  IF NOT app.registry_access(ord.organization_id,ord.property_id,'stock.manage') THEN RAISE EXCEPTION 'SERVICE_FORBIDDEN' USING ERRCODE='42501';END IF;
 ELSE PERFORM service_private.guest_user(session_hash);END IF;
 UPDATE public.market_orders SET revision=revision+1,updated_at=clock_timestamp() WHERE order_id=oid;
 result:=service_private.market_receipt(oid);
 PERFORM service_private.service_command_record(who,mid,key,payload,result,ord.organization_id,oid,'market.cancel');RETURN result;
END $$;
REVOKE ALL ON FUNCTION service_private.market_cancel(text,uuid,uuid,jsonb,boolean) FROM PUBLIC;

COMMIT;
