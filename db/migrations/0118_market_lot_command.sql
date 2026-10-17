BEGIN;
-- No app wrapper or runtime grant: lifecycle integration must precede activation.
CREATE FUNCTION service_private.market_lot_command(session_hash text,oid uuid,key uuid,body jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid:=service_private.staff_user(session_hash);mid uuid:=app.current_membership_id();
 ord public.service_orders;m public.market_orders;stay public.reservations;line record;selection jsonb;
 action text:=body->>'action';payload jsonb;prior jsonb;result jsonb;held jsonb;
BEGIN
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR action IS NULL OR action NOT IN ('reserve_lots','release_lots')
 OR jsonb_typeof(body->'expectedRevision') IS DISTINCT FROM 'number' OR body->>'expectedRevision' !~ '^[1-9][0-9]*$'
 OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM
  (CASE action WHEN 'reserve_lots' THEN ARRAY['action','expectedRevision','selections'] ELSE ARRAY['action','expectedRevision','note'] END)
 THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023';END IF;
 IF action='reserve_lots' THEN
  IF jsonb_typeof(body->'selections') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023';END IF;
  IF jsonb_array_length(body->'selections') NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023';END IF;
  FOR selection IN SELECT value FROM jsonb_array_elements(body->'selections') LOOP
   IF jsonb_typeof(selection) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(selection) k) IS DISTINCT FROM ARRAY['expiresOn','itemId','lotCode','movementId']
   OR jsonb_typeof(selection->'itemId') IS DISTINCT FROM 'string' OR jsonb_typeof(selection->'movementId') IS DISTINCT FROM 'string'
   OR jsonb_typeof(selection->'lotCode') IS DISTINCT FROM 'string' OR jsonb_typeof(selection->'expiresOn') IS DISTINCT FROM 'string'
   OR length(selection->>'lotCode') NOT BETWEEN 1 AND 80 OR selection->>'lotCode'<>btrim(selection->>'lotCode') OR selection->>'lotCode' ~ '[[:cntrl:]]'
   OR selection->>'expiresOn' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR to_char((selection->>'expiresOn')::date,'YYYY-MM-DD')<>selection->>'expiresOn'
   THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023';END IF;
   PERFORM (selection->>'itemId')::uuid,(selection->>'movementId')::uuid;
  END LOOP;
  IF (SELECT count(DISTINCT (x->>'itemId')::uuid) FROM jsonb_array_elements(body->'selections') x)<>jsonb_array_length(body->'selections')
  THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023';END IF;
 ELSIF jsonb_typeof(body->'note') IS DISTINCT FROM 'string' OR length(btrim(body->>'note')) NOT BETWEEN 3 AND 500 THEN
  RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023';
 END IF;
 SELECT o.* INTO ord FROM public.service_orders o JOIN public.market_orders linked ON linked.order_id=o.id WHERE o.id=oid AND o.organization_id=app.current_organization_id();
 IF ord.id IS NULL THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002';END IF;
 IF NOT app.registry_access(ord.organization_id,ord.property_id,'stock.manage') THEN RAISE EXCEPTION 'SERVICE_FORBIDDEN' USING ERRCODE='42501';END IF;
 payload:=jsonb_build_object('kind','market_lot_command','membershipId',mid,'orderId',oid,'body',body);
 prior:=service_private.service_command_replay(who,key,payload);
 -- Replay can wait on an advisory lock: never return a cached result without reauthorization.
 PERFORM service_private.staff_user(session_hash);
 IF NOT app.registry_access(ord.organization_id,ord.property_id,'stock.manage') THEN RAISE EXCEPTION 'SERVICE_FORBIDDEN' USING ERRCODE='42501';END IF;
 IF prior IS NOT NULL THEN RETURN prior;END IF;
 SELECT * INTO stay FROM public.reservations WHERE id=ord.reservation_id FOR UPDATE;
 SELECT * INTO m FROM public.market_orders WHERE order_id=oid FOR UPDATE;
 PERFORM 1 FROM public.supply_items i JOIN public.market_order_lines l ON l.item_id=i.id WHERE l.order_id=oid ORDER BY i.id FOR UPDATE OF i;
 PERFORM service_private.staff_user(session_hash);
 IF NOT app.registry_access(ord.organization_id,ord.property_id,'stock.manage') THEN RAISE EXCEPTION 'SERVICE_FORBIDDEN' USING ERRCODE='42501';END IF;
 IF m.revision IS DISTINCT FROM (body->>'expectedRevision')::integer THEN RAISE EXCEPTION 'SERVICE_REVISION_CHANGED' USING ERRCODE='23514';END IF;
 IF m.stage NOT IN ('reserved','picking','ready') THEN RAISE EXCEPTION 'SERVICE_TRANSITION_INVALID' USING ERRCODE='23514';END IF;
 IF action='reserve_lots' THEN
  IF stay.id IS NULL OR stay.status<>'checked_in' OR stay.check_out_at<=clock_timestamp() THEN RAISE EXCEPTION 'SERVICE_STAY_INELIGIBLE' USING ERRCODE='23514';END IF;
  IF EXISTS(SELECT 1 FROM public.market_lot_reservations WHERE order_id=oid AND released_at IS NULL) THEN RAISE EXCEPTION 'SERVICE_TRANSITION_INVALID' USING ERRCODE='23514';END IF;
  IF jsonb_array_length(body->'selections')<>(SELECT count(*) FROM public.market_order_lines WHERE order_id=oid)
  OR EXISTS(SELECT 1 FROM public.market_order_lines l WHERE l.order_id=oid AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(body->'selections') x WHERE (x->>'itemId')::uuid=l.item_id))
  THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023';END IF;
  FOR line IN SELECT * FROM public.market_order_lines WHERE order_id=oid ORDER BY item_id LOOP
   SELECT x INTO selection FROM jsonb_array_elements(body->'selections') x WHERE (x->>'itemId')::uuid=line.item_id;
   INSERT INTO public.market_lot_reservations(organization_id,property_id,order_id,item_id,movement_id,lot_code,expires_on,quantity)
   VALUES(ord.organization_id,ord.property_id,oid,line.item_id,(selection->>'movementId')::uuid,selection->>'lotCode',(selection->>'expiresOn')::date,line.quantity);
  END LOOP;
 ELSE
  UPDATE public.market_lot_reservations SET released_at=clock_timestamp() WHERE order_id=oid AND released_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_TRANSITION_INVALID' USING ERRCODE='23514';END IF;
 END IF;
 UPDATE public.market_orders SET revision=revision+1,updated_at=clock_timestamp() WHERE order_id=oid;
 SELECT coalesce(jsonb_agg(jsonb_build_object('itemId',item_id,'movementId',movement_id,'lotCode',lot_code,'expiresOn',expires_on,'quantity',quantity) ORDER BY item_id),'[]') INTO held
 FROM public.market_lot_reservations WHERE order_id=oid AND released_at IS NULL;
 result:=service_private.market_receipt(oid)||jsonb_build_object('reservedLots',held);
 IF action='release_lots' THEN result:=result||jsonb_build_object('releaseNote',btrim(body->>'note'));END IF;
 PERFORM service_private.service_command_record(who,mid,key,payload,result,ord.organization_id,oid,'market.'||action);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION service_private.market_lot_command(text,uuid,uuid,jsonb) FROM PUBLIC;
COMMIT;
