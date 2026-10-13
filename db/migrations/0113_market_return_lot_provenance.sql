BEGIN;
ALTER TABLE public.supply_movements ADD COLUMN return_source_issue_id uuid REFERENCES public.supply_movements(id);
CREATE FUNCTION app.market_return_lot_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.return_source_issue_id IS NULL THEN RETURN NEW;END IF;
 IF NEW.kind<>'return' OR NOT EXISTS(
  SELECT 1 FROM public.market_returns r JOIN public.supply_movements i ON i.id=NEW.return_source_issue_id
  WHERE r.id=NEW.market_return_id AND r.organization_id=NEW.organization_id AND r.property_id=NEW.property_id AND r.item_id=NEW.item_id
   AND i.organization_id=r.organization_id AND i.property_id=r.property_id AND i.item_id=r.item_id AND i.kind='issue'
   AND i.reference='V Market '||r.order_id AND i.lot_allocation IS NOT NULL AND NEW.quantity<=-i.quantity)
 THEN RAISE EXCEPTION 'SERVICE_RETURN_INVALID' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.market_return_lot_guard() FROM PUBLIC;
CREATE TRIGGER market_return_lot_guard BEFORE INSERT ON public.supply_movements FOR EACH ROW EXECUTE FUNCTION app.market_return_lot_guard();
CREATE OR REPLACE FUNCTION service_private.market_return_act(session_hash text,oid uuid,key uuid,body jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid:=service_private.staff_user(session_hash);mid uuid:=app.current_membership_id();ord public.service_orders;m public.market_orders;r public.market_returns;line jsonb;returned bigint;source_issue uuid;
 action text:=body->>'action';keys text[];payload jsonb:=jsonb_build_object('kind','market_return','orderId',oid,'membershipId',mid,'body',body);prior jsonb;result jsonb;movement uuid:=gen_random_uuid();
BEGIN
 keys:=CASE action WHEN 'receive_return' THEN ARRAY['action','expectedRevision','note','quantity','serviceId'] WHEN 'restock_return' THEN CASE WHEN body ? 'sameIssuedLot' THEN ARRAY['action','checklist','expectedRevision','note','returnId','sameIssuedLot'] ELSE ARRAY['action','checklist','expectedRevision','note','returnId'] END WHEN 'discard_return' THEN ARRAY['action','expectedRevision','note','returnId'] END;
 IF keys IS NULL OR jsonb_typeof(body) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM keys
 OR jsonb_typeof(body->'expectedRevision') IS DISTINCT FROM 'number' OR body->>'expectedRevision' !~ '^[1-9][0-9]*$'
 OR jsonb_typeof(body->'note') IS DISTINCT FROM 'string' OR length(btrim(body->>'note')) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023';END IF;
 SELECT o.* INTO ord FROM public.service_orders o JOIN public.market_orders linked ON linked.order_id=o.id WHERE o.id=oid;
 IF ord.id IS NULL THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002';END IF;
 IF NOT app.registry_access(ord.organization_id,ord.property_id,'stock.manage') THEN RAISE EXCEPTION 'SERVICE_FORBIDDEN' USING ERRCODE='42501';END IF;
 prior:=service_private.service_command_replay(who,key,payload);IF prior IS NOT NULL THEN RETURN prior;END IF;
 PERFORM 1 FROM public.reservations WHERE id=ord.reservation_id FOR UPDATE;
 SELECT * INTO m FROM public.market_orders WHERE order_id=oid FOR UPDATE;
 PERFORM service_private.staff_user(session_hash);
 IF NOT app.registry_access(ord.organization_id,ord.property_id,'stock.manage') THEN RAISE EXCEPTION 'SERVICE_FORBIDDEN' USING ERRCODE='42501';END IF;
 IF m.revision IS DISTINCT FROM (body->>'expectedRevision')::integer THEN RAISE EXCEPTION 'SERVICE_REVISION_CHANGED' USING ERRCODE='23514';END IF;
 IF m.stage<>'completed' THEN RAISE EXCEPTION 'SERVICE_RETURN_INVALID' USING ERRCODE='23514';END IF;
 IF action='receive_return' THEN
  IF (SELECT count(*) FROM public.market_returns WHERE order_id=oid)>=20 THEN RAISE EXCEPTION 'SERVICE_RETURN_LIMIT' USING ERRCODE='23514';END IF;
  IF jsonb_typeof(body->'quantity') IS DISTINCT FROM 'number' OR body->>'quantity' !~ '^([1-9]|[1-4][0-9]|50)$' THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023';END IF;
  SELECT l INTO line FROM jsonb_array_elements(ord.snapshot->'lines') l WHERE (l->>'serviceId')::uuid=(body->>'serviceId')::uuid;
  IF line IS NULL THEN RAISE EXCEPTION 'SERVICE_RETURN_INVALID' USING ERRCODE='23514';END IF;
  SELECT coalesce(sum(quantity),0) INTO returned FROM public.market_returns WHERE order_id=oid AND service_id=(body->>'serviceId')::uuid;
  IF returned+(body->>'quantity')::integer>(line->>'quantity')::integer THEN RAISE EXCEPTION 'SERVICE_RETURN_LIMIT' USING ERRCODE='23514';END IF;
  INSERT INTO public.market_returns(organization_id,property_id,order_id,service_id,item_id,quantity,reason) VALUES(ord.organization_id,ord.property_id,oid,(line->>'serviceId')::uuid,(line->>'itemId')::uuid,(body->>'quantity')::integer,btrim(body->>'note'));
 ELSE
  SELECT * INTO r FROM public.market_returns WHERE id=(body->>'returnId')::uuid AND order_id=oid FOR UPDATE;
  IF r.id IS NULL OR r.status<>'quarantined' THEN RAISE EXCEPTION 'SERVICE_RETURN_INVALID' USING ERRCODE='23514';END IF;
  IF action='restock_return' THEN
   IF body->'checklist' IS DISTINCT FROM '{"sealed":true,"expiry":true,"quality":true}'::jsonb THEN RAISE EXCEPTION 'SERVICE_CHECKLIST_INCOMPLETE' USING ERRCODE='23514';END IF;
   PERFORM 1 FROM public.supply_items WHERE id=r.item_id ORDER BY id FOR UPDATE;
   IF body ? 'sameIssuedLot' THEN
    IF body->'sameIssuedLot' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023';END IF;
    SELECT id INTO source_issue FROM public.supply_movements WHERE organization_id=r.organization_id AND property_id=r.property_id AND item_id=r.item_id AND kind='issue' AND reference='V Market '||oid AND lot_allocation IS NOT NULL;
    IF source_issue IS NULL THEN RAISE EXCEPTION 'SERVICE_RETURN_INVALID' USING ERRCODE='23514';END IF;
   END IF;
   UPDATE public.market_returns SET status='restocked',movement_id=movement,resolution_note=btrim(body->>'note') WHERE id=r.id;
   INSERT INTO public.supply_movements(id,organization_id,property_id,item_id,kind,quantity,reference,market_return_id,actor_user_id,actor_membership_id,return_source_issue_id)
   VALUES(movement,r.organization_id,r.property_id,r.item_id,'return',r.quantity,'V Market return '||r.id,r.id,who,mid,source_issue);
  ELSE UPDATE public.market_returns SET status='discarded',resolution_note=btrim(body->>'note') WHERE id=r.id;
  END IF;
 END IF;
 UPDATE public.market_orders SET revision=revision+1,updated_at=clock_timestamp() WHERE order_id=oid;
 result:=service_private.market_receipt(oid);
 PERFORM service_private.service_command_record(who,mid,key,payload,result,ord.organization_id,oid,'market.'||action);RETURN result;
END $$;
COMMIT;
