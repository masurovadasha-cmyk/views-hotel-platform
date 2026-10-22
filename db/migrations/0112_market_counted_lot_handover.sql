BEGIN;
-- Extend the original fulfilment function; existing wrappers and authorization stay intact.
CREATE OR REPLACE FUNCTION service_private.market_fulfilment_act(session_hash text,oid uuid,key uuid,body jsonb,staff boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid; mid uuid; ord public.service_orders; m public.market_orders; stay public.reservations; folio public.guest_folios; entry uuid; l record;
 action text:=body->>'action'; payload jsonb; prior jsonb; result jsonb;
BEGIN
 IF staff THEN who:=service_private.staff_user(session_hash);mid:=app.current_membership_id();ELSE who:=service_private.guest_user(session_hash);END IF;
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR action IS NULL OR jsonb_typeof(body->'expectedRevision') IS DISTINCT FROM 'number' OR body->>'expectedRevision' !~ '^[1-9][0-9]*$' THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 IF (action='ready' AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM ARRAY['action','checklist','expectedRevision']) OR (action<>'ready' AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM CASE WHEN staff AND action='handover' AND body ? 'lotSelections' THEN ARRAY['action','expectedRevision','lotSelections'] ELSE ARRAY['action','expectedRevision'] END) THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 SELECT o.* INTO ord FROM public.service_orders o JOIN public.market_orders linked ON linked.order_id=o.id WHERE o.id=oid;
 IF ord.id IS NULL THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002';END IF;
 IF staff THEN
  IF NOT app.registry_access(ord.organization_id,ord.property_id,'stock.manage') THEN RAISE EXCEPTION 'SERVICE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 ELSE
  PERFORM 1 FROM public.reservations r JOIN public.guest_profiles g ON g.id=r.primary_guest_id AND g.organization_id=r.organization_id WHERE r.id=ord.reservation_id AND g.user_id=who;
  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 END IF;
 payload:=jsonb_build_object('kind','market_action','staff',staff,'membershipId',mid,'orderId',oid,'body',body);
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
 PERFORM 1 FROM public.supply_items i JOIN public.market_order_lines held ON held.item_id=i.id WHERE held.order_id=oid ORDER BY i.id FOR UPDATE OF i;
 IF action='cancel' AND (m.stage='reserved' OR staff AND m.stage IN ('picking','ready')) THEN
  UPDATE public.market_orders SET stage='cancelled' WHERE order_id=oid;
  UPDATE public.service_orders SET status='cancelled' WHERE id=oid;
 ELSIF staff AND action='pick' AND m.stage='reserved' THEN
  IF stay.status<>'checked_in' OR stay.check_out_at<=clock_timestamp() THEN RAISE EXCEPTION 'SERVICE_STAY_INELIGIBLE' USING ERRCODE='23514'; END IF;
  UPDATE public.market_orders SET stage='picking' WHERE order_id=oid;
  UPDATE public.service_orders SET status='accepted' WHERE id=oid;
 ELSIF staff AND action='ready' AND m.stage='picking' THEN
  IF body->'checklist' IS DISTINCT FROM '{"quantities":true,"expiry":true,"packaging":true}'::jsonb THEN RAISE EXCEPTION 'SERVICE_CHECKLIST_INCOMPLETE' USING ERRCODE='23514'; END IF;
  UPDATE public.market_orders SET stage='ready',checklist=body->'checklist' WHERE order_id=oid;
  UPDATE public.service_orders SET status='in_progress' WHERE id=oid;
 ELSIF staff AND action='handover' AND m.stage='ready' THEN
  IF stay.status<>'checked_in' OR stay.check_out_at<=clock_timestamp() THEN RAISE EXCEPTION 'SERVICE_STAY_INELIGIBLE' USING ERRCODE='23514'; END IF;
  IF body ? 'lotSelections' THEN
   IF jsonb_typeof(body->'lotSelections') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023';END IF;
   IF jsonb_array_length(body->'lotSelections')<>(SELECT count(*) FROM public.market_order_lines WHERE order_id=oid)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(body->'lotSelections') x WHERE jsonb_typeof(x) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(x) k) IS DISTINCT FROM ARRAY['lotAllocation','serviceId'])
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(ord.snapshot->'lines') line WHERE (SELECT count(*) FROM jsonb_array_elements(body->'lotSelections') x WHERE x->>'serviceId'=line->>'serviceId')<>1)
   THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023';END IF;
  END IF;
  -- Release this order's reserves and issue its quantities in the same transaction.
  UPDATE public.market_orders SET stage='handed_over' WHERE order_id=oid;
  FOR l IN SELECT * FROM public.market_order_lines WHERE order_id=oid ORDER BY item_id LOOP
   INSERT INTO public.supply_movements(organization_id,property_id,item_id,kind,quantity,reference,actor_user_id,actor_membership_id,lot_allocation)
   VALUES(ord.organization_id,ord.property_id,l.item_id,'issue',-l.quantity,'V Market '||oid,who,mid,(SELECT x->'lotAllocation' FROM jsonb_array_elements(body->'lotSelections') x WHERE x->>'serviceId'=(SELECT line->>'serviceId' FROM jsonb_array_elements(ord.snapshot->'lines') line WHERE line->>'itemId'=l.item_id::text)));
  END LOOP;
 ELSIF NOT staff AND action='confirm_receipt' AND m.stage='handed_over' THEN
  SELECT * INTO folio FROM public.guest_folios WHERE reservation_id=stay.id AND organization_id=ord.organization_id FOR UPDATE;
  IF folio.id IS NULL THEN INSERT INTO public.guest_folios(organization_id,property_id,reservation_id,currency) VALUES(ord.organization_id,ord.property_id,stay.id,ord.currency) RETURNING * INTO folio;
  ELSIF folio.status<>'open' THEN RAISE EXCEPTION 'FOLIO_NOT_OPEN' USING ERRCODE='23514'; END IF;
  entry:=gen_random_uuid();
  INSERT INTO public.folio_entries(id,organization_id,property_id,folio_id,currency,kind,amount_minor,label,source_type,source_id,idempotency_key,policy_snapshot)
  VALUES(entry,ord.organization_id,ord.property_id,folio.id,ord.currency,'service',ord.total_minor,ord.snapshot->'name','service_order',oid,'service-order:'||oid,ord.snapshot);
  UPDATE public.market_orders SET stage='completed',folio_entry_id=entry WHERE order_id=oid;
  UPDATE public.service_orders SET status='completed' WHERE id=oid;
 ELSE RAISE EXCEPTION 'SERVICE_TRANSITION_INVALID' USING ERRCODE='23514'; END IF;
 UPDATE public.market_orders SET revision=revision+1,updated_at=clock_timestamp() WHERE order_id=oid;
 result:=service_private.market_receipt(oid);
 PERFORM service_private.service_command_record(who,mid,key,payload,result,ord.organization_id,oid,'market.'||action);RETURN result;
EXCEPTION WHEN serialization_failure THEN RAISE EXCEPTION 'SERVICE_REVISION_CHANGED' USING ERRCODE='23514';
 WHEN check_violation THEN IF SQLERRM IN ('INSUFFICIENT_STOCK','LOT_ALLOCATION_INVALID') THEN RAISE EXCEPTION 'SERVICE_STOCK_UNAVAILABLE' USING ERRCODE='23514';ELSE RAISE;END IF;
END $$;
COMMIT;
