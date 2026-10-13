BEGIN;
CREATE FUNCTION service_private.market_reopen_picking(session_hash text,oid uuid,key uuid,body jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid:=service_private.staff_user(session_hash);mid uuid:=app.current_membership_id();ord public.service_orders;m public.market_orders;
 payload jsonb:=jsonb_build_object('kind','market_reopen_picking','orderId',oid,'membershipId',mid,'body',body);prior jsonb;result jsonb;
BEGIN
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM ARRAY['action','expectedRevision','note','returnedToStorage']
 OR body->>'action' IS DISTINCT FROM 'reopen_picking' OR body->'returnedToStorage' IS DISTINCT FROM 'true'::jsonb
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
 IF m.stage NOT IN ('picking','ready') THEN RAISE EXCEPTION 'SERVICE_TRANSITION_INVALID' USING ERRCODE='23514';END IF;
 -- All three stages retain the same stock reservation; no physical stock movement.
 UPDATE public.market_orders SET stage='reserved',checklist=NULL,revision=revision+1,updated_at=clock_timestamp() WHERE order_id=oid;
 UPDATE public.service_orders SET status='requested' WHERE id=oid;
 result:=service_private.market_receipt(oid);
 PERFORM service_private.service_command_record(who,mid,key,payload,result,ord.organization_id,oid,'market.reopen_picking');RETURN result;
END $$;
REVOKE ALL ON FUNCTION service_private.market_reopen_picking(text,uuid,uuid,jsonb) FROM PUBLIC;
CREATE OR REPLACE FUNCTION app.market_staff_act(session_hash text,oid uuid,key uuid,body jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF body->>'action'='reopen_picking' THEN RETURN service_private.market_reopen_picking(session_hash,oid,key,body);END IF;
 IF body->>'action' IN ('receive_return','restock_return','discard_return') THEN RETURN service_private.market_return_act(session_hash,oid,key,body);END IF;
 IF body->>'action' IN ('propose_replacement','propose_quantity','withdraw_proposal') THEN RETURN service_private.market_proposal_act(session_hash,oid,key,body,true);END IF;
 RETURN service_private.market_act(session_hash,oid,key,body,true);
END $$;
CREATE OR REPLACE FUNCTION app.guard_service_order() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF (to_jsonb(OLD)-'status') IS DISTINCT FROM (to_jsonb(NEW)-'status') OR NOT(
  OLD.status='requested' AND NEW.status IN ('accepted','cancelled') OR
  OLD.status='accepted' AND NEW.status IN ('in_progress','cancelled') OR
  OLD.status='in_progress' AND NEW.status='completed' OR
  OLD.status IN ('accepted','in_progress') AND NEW.status='requested'
   AND current_user=(SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='service_private.market_reopen_picking(text,uuid,uuid,jsonb)'::regprocedure)
   AND EXISTS(SELECT 1 FROM public.market_orders m WHERE m.order_id=OLD.id AND m.stage='reserved' AND m.checklist IS NULL)) THEN
  RAISE EXCEPTION 'SERVICE_ORDER_TRANSITION_INVALID' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
COMMIT;
