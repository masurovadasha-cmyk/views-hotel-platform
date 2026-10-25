BEGIN;
-- Dedicated handover path: no runtime activation of the private reserve command.
CREATE FUNCTION service_private.market_handover(session_hash text,oid uuid,key uuid,body jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid:=service_private.staff_user(session_hash);mid uuid:=app.current_membership_id();
 ord public.service_orders;m public.market_orders;stay public.reservations;line record;
 payload jsonb;prior jsonb;result jsonb;held integer;selection jsonb;
BEGIN
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR body->>'action' IS DISTINCT FROM 'handover'
 OR jsonb_typeof(body->'expectedRevision') IS DISTINCT FROM 'number' OR body->>'expectedRevision' !~ '^[1-9][0-9]*$'
 OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM
  (CASE WHEN body ? 'lotSelections' THEN ARRAY['action','expectedRevision','lotSelections'] ELSE ARRAY['action','expectedRevision'] END)
 THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023';END IF;
 SELECT o.* INTO ord FROM public.service_orders o JOIN public.market_orders linked ON linked.order_id=o.id WHERE o.id=oid;
 IF ord.id IS NULL THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002';END IF;
 IF NOT app.registry_access(ord.organization_id,ord.property_id,'stock.manage') THEN RAISE EXCEPTION 'SERVICE_FORBIDDEN' USING ERRCODE='42501';END IF;
 payload:=jsonb_build_object('kind','market_action','staff',true,'membershipId',mid,'orderId',oid,'body',body);
 PERFORM pg_advisory_xact_lock(hashtextextended('service:'||who||':'||key,0));
 SELECT * INTO stay FROM public.reservations WHERE id=ord.reservation_id FOR UPDATE;
 SELECT * INTO m FROM public.market_orders WHERE order_id=oid FOR UPDATE;
 PERFORM service_private.staff_user(session_hash);
 IF NOT app.registry_access(ord.organization_id,ord.property_id,'stock.manage') THEN RAISE EXCEPTION 'SERVICE_FORBIDDEN' USING ERRCODE='42501';END IF;
 prior:=service_private.service_command_replay(who,key,payload);IF prior IS NOT NULL THEN RETURN prior;END IF;
 IF m.revision IS DISTINCT FROM (body->>'expectedRevision')::integer THEN RAISE EXCEPTION 'SERVICE_REVISION_CHANGED' USING ERRCODE='23514';END IF;
 IF m.stage<>'ready' THEN RAISE EXCEPTION 'SERVICE_TRANSITION_INVALID' USING ERRCODE='23514';END IF;
 PERFORM 1 FROM public.supply_items i JOIN public.market_order_lines l ON l.item_id=i.id WHERE l.order_id=oid ORDER BY i.id FOR UPDATE OF i;
 PERFORM 1 FROM public.market_lot_reservations WHERE order_id=oid AND released_at IS NULL ORDER BY item_id FOR UPDATE;
 PERFORM service_private.staff_user(session_hash);
 IF NOT app.registry_access(ord.organization_id,ord.property_id,'stock.manage') THEN RAISE EXCEPTION 'SERVICE_FORBIDDEN' USING ERRCODE='42501';END IF;
 IF stay.status<>'checked_in' OR stay.check_out_at<=clock_timestamp() THEN RAISE EXCEPTION 'SERVICE_STAY_INELIGIBLE' USING ERRCODE='23514';END IF;
 IF body ? 'lotSelections' THEN
  IF jsonb_typeof(body->'lotSelections') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023';END IF;
  IF jsonb_array_length(body->'lotSelections')<>(SELECT count(*) FROM public.market_order_lines WHERE order_id=oid)
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(body->'lotSelections') x WHERE jsonb_typeof(x) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(x) k) IS DISTINCT FROM ARRAY['lotAllocation','serviceId'])
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(ord.snapshot->'lines') l WHERE (SELECT count(*) FROM jsonb_array_elements(body->'lotSelections') x WHERE x->>'serviceId'=l->>'serviceId')<>1)
  THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023';END IF;
 END IF;
 SELECT count(*) INTO held FROM public.market_lot_reservations WHERE order_id=oid AND released_at IS NULL;
 IF held>0 THEN
  IF NOT(body ? 'lotSelections') OR held<>(SELECT count(*) FROM public.market_order_lines WHERE order_id=oid)
  THEN RAISE EXCEPTION 'LOT_RESERVE_MISMATCH' USING ERRCODE='23514';END IF;
  FOR line IN SELECT r.*,l.quantity expected_quantity,p.last_movement_id,p.source_snapshot_id,p.status projection_status
   FROM public.market_lot_reservations r JOIN public.market_order_lines l ON l.order_id=r.order_id AND l.item_id=r.item_id
   LEFT JOIN public.supply_lot_projections p ON p.item_id=r.item_id AND p.organization_id=r.organization_id AND p.property_id=r.property_id
   WHERE r.order_id=oid AND r.released_at IS NULL ORDER BY r.item_id LOOP
   SELECT x->'lotAllocation' INTO selection FROM jsonb_array_elements(body->'lotSelections') x
    WHERE x->>'serviceId'=(SELECT l->>'serviceId' FROM jsonb_array_elements(ord.snapshot->'lines') l WHERE l->>'itemId'=line.item_id::text);
   IF line.organization_id<>ord.organization_id OR line.property_id<>ord.property_id OR line.quantity<>line.expected_quantity
    OR jsonb_typeof(selection) IS DISTINCT FROM 'object'
    OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(selection) k) IS DISTINCT FROM ARRAY['expiresOn','lotCode','movementId','snapshotId']
    OR selection->>'movementId' IS DISTINCT FROM line.movement_id::text
    OR selection->>'snapshotId' IS DISTINCT FROM line.source_snapshot_id::text
    OR selection->>'lotCode' IS DISTINCT FROM line.lot_code
    OR selection->>'expiresOn' IS DISTINCT FROM line.expires_on::text
   THEN RAISE EXCEPTION 'LOT_RESERVE_MISMATCH' USING ERRCODE='23514';END IF;
   IF line.projection_status IS DISTINCT FROM 'reconciled' OR line.last_movement_id IS DISTINCT FROM line.movement_id
   THEN RAISE EXCEPTION 'SERVICE_REVISION_CHANGED' USING ERRCODE='23514';END IF;
  END LOOP;
  -- Release only the consuming order before the issue guards check remaining held stock.
  UPDATE public.market_lot_reservations SET released_at=clock_timestamp()
   WHERE order_id=oid AND organization_id=ord.organization_id AND property_id=ord.property_id AND released_at IS NULL;
 END IF;
 UPDATE public.market_orders SET stage='handed_over' WHERE order_id=oid;
 FOR line IN SELECT * FROM public.market_order_lines WHERE order_id=oid ORDER BY item_id LOOP
  INSERT INTO public.supply_movements(organization_id,property_id,item_id,kind,quantity,reference,actor_user_id,actor_membership_id,lot_allocation)
  VALUES(ord.organization_id,ord.property_id,line.item_id,'issue',-line.quantity,'V Market '||oid,who,mid,
   (SELECT x->'lotAllocation' FROM jsonb_array_elements(body->'lotSelections') x WHERE x->>'serviceId'=(SELECT l->>'serviceId' FROM jsonb_array_elements(ord.snapshot->'lines') l WHERE l->>'itemId'=line.item_id::text)));
 END LOOP;
 UPDATE public.market_orders SET revision=revision+1,updated_at=clock_timestamp() WHERE order_id=oid;
 result:=service_private.market_receipt(oid);
 PERFORM service_private.service_command_record(who,mid,key,payload,result,ord.organization_id,oid,'market.handover');
 PERFORM service_private.staff_user(session_hash);
 IF NOT app.registry_access(ord.organization_id,ord.property_id,'stock.manage') THEN RAISE EXCEPTION 'SERVICE_FORBIDDEN' USING ERRCODE='42501';END IF;
 RETURN result;
EXCEPTION WHEN serialization_failure THEN RAISE EXCEPTION 'SERVICE_REVISION_CHANGED' USING ERRCODE='23514';
 WHEN check_violation THEN IF SQLERRM IN ('INSUFFICIENT_STOCK','LOT_ALLOCATION_INVALID') THEN RAISE EXCEPTION 'SERVICE_STOCK_UNAVAILABLE' USING ERRCODE='23514';ELSE RAISE;END IF;
END $$;
REVOKE ALL ON FUNCTION service_private.market_handover(text,uuid,uuid,jsonb) FROM PUBLIC;
CREATE OR REPLACE FUNCTION app.market_staff_act(session_hash text,oid uuid,key uuid,body jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF body->>'action'='handover' THEN RETURN service_private.market_handover(session_hash,oid,key,body);END IF;
 IF body->>'action'='cancel' THEN RETURN service_private.market_cancel(session_hash,oid,key,body,true);END IF;
 IF body->>'action'='reopen_picking' THEN RETURN service_private.market_reopen_picking(session_hash,oid,key,body);END IF;
 IF body->>'action' IN ('receive_return','restock_return','discard_return') THEN RETURN service_private.market_return_act(session_hash,oid,key,body);END IF;
 IF body->>'action' IN ('propose_replacement','propose_quantity','withdraw_proposal') THEN RETURN service_private.market_proposal_act(session_hash,oid,key,body,true);END IF;
 RETURN service_private.market_act(session_hash,oid,key,body,true);
END $$;
COMMIT;
