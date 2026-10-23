BEGIN;
-- Isolate cancellation; preserve all fulfilment and replacement dispatch paths.
CREATE FUNCTION service_private.market_cancel(session_hash text,oid uuid,key uuid,body jsonb,staff boolean) RETURNS jsonb
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

CREATE OR REPLACE FUNCTION app.market_guest_act(session_hash text,oid uuid,key uuid,body jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF body->>'action'='cancel' THEN RETURN service_private.market_cancel(session_hash,oid,key,body,false);END IF;
 IF body->>'action'='confirm_receipt' THEN RETURN service_private.market_confirm_receipt(session_hash,oid,key,body);END IF;
 IF body->>'action'='report_issue' THEN RETURN service_private.market_report_issue(session_hash,oid,key,body);END IF;
 IF body->>'action' IN ('accept_proposal','decline_proposal') THEN RETURN service_private.market_proposal_act(session_hash,oid,key,body,false);END IF;
 IF body->>'action'='replace_order' THEN RETURN service_private.market_replace(session_hash,oid,key,body);END IF;
 RETURN service_private.market_act(session_hash,oid,key,body,false);
END $$;

CREATE OR REPLACE FUNCTION app.market_staff_act(session_hash text,oid uuid,key uuid,body jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF body->>'action'='cancel' THEN RETURN service_private.market_cancel(session_hash,oid,key,body,true);END IF;
 IF body->>'action'='reopen_picking' THEN RETURN service_private.market_reopen_picking(session_hash,oid,key,body);END IF;
 IF body->>'action' IN ('receive_return','restock_return','discard_return') THEN RETURN service_private.market_return_act(session_hash,oid,key,body);END IF;
 IF body->>'action' IN ('propose_replacement','propose_quantity','withdraw_proposal') THEN RETURN service_private.market_proposal_act(session_hash,oid,key,body,true);END IF;
 RETURN service_private.market_act(session_hash,oid,key,body,true);
END $$;

CREATE OR REPLACE FUNCTION app.guard_service_order() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE reopen_owner name;cancel_owner name;
BEGIN
 SELECT pg_get_userbyid(p.proowner) INTO reopen_owner
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='service_private' AND p.proname='market_reopen_picking'
  AND p.pronargs=4 AND oidvectortypes(p.proargtypes)='text, uuid, uuid, jsonb'
 LIMIT 1;
 SELECT pg_get_userbyid(p.proowner) INTO cancel_owner
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='service_private' AND p.proname='market_cancel'
  AND p.pronargs=5 AND oidvectortypes(p.proargtypes)='text, uuid, uuid, jsonb, boolean'
 LIMIT 1;
 IF (to_jsonb(OLD)-'status') IS DISTINCT FROM (to_jsonb(NEW)-'status') OR NOT(
  OLD.status='requested' AND NEW.status IN ('accepted','cancelled') OR
  OLD.status='accepted' AND NEW.status IN ('in_progress','cancelled') OR
  OLD.status='in_progress' AND NEW.status='completed' OR
  OLD.status='in_progress' AND NEW.status='cancelled'
   AND coalesce(current_user=cancel_owner,false)
   AND OLD.snapshot->>'execution'='market'
   AND EXISTS(SELECT 1 FROM public.market_orders m WHERE m.order_id=OLD.id
    AND m.organization_id=OLD.organization_id AND m.property_id=OLD.property_id AND m.stage='cancelled') OR
  OLD.status IN ('accepted','in_progress') AND NEW.status='requested'
   AND coalesce(current_user=reopen_owner,false)
   AND EXISTS(SELECT 1 FROM public.market_orders m WHERE m.order_id=OLD.id AND m.stage='reserved' AND m.checklist IS NULL)) THEN
  RAISE EXCEPTION 'SERVICE_ORDER_TRANSITION_INVALID' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
COMMIT;
