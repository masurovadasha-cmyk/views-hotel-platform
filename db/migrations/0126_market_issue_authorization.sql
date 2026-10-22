BEGIN;
-- Isolate guest issue authorization; keep other dispatch paths and financial state unchanged.
CREATE FUNCTION service_private.market_report_issue(session_hash text,oid uuid,key uuid,body jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid:=service_private.guest_user(session_hash);ord public.service_orders;m public.market_orders;stay public.reservations;
 payload jsonb;prior jsonb;result jsonb;
BEGIN
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR body->>'action' IS DISTINCT FROM 'report_issue'
  OR jsonb_typeof(body->'expectedRevision') IS DISTINCT FROM 'number' OR body->>'expectedRevision' !~ '^[1-9][0-9]*$'
  OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM ARRAY['action','expectedRevision','note']
  OR jsonb_typeof(body->'note') IS DISTINCT FROM 'string' OR length(btrim(body->>'note')) NOT BETWEEN 3 AND 1000
 THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023';END IF;
 SELECT o.* INTO ord FROM public.service_orders o JOIN public.market_orders linked ON linked.order_id=o.id WHERE o.id=oid;
 IF ord.id IS NULL THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002';END IF;
 PERFORM 1 FROM public.reservations r JOIN public.guest_profiles g ON g.id=r.primary_guest_id AND g.organization_id=r.organization_id WHERE r.id=ord.reservation_id AND g.user_id=who;
 IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002';END IF;
 payload:=jsonb_build_object('kind','market_issue','staff',false,'membershipId',NULL,'orderId',oid,'body',body);
 PERFORM pg_advisory_xact_lock(hashtextextended('service:'||who||':'||key,0));
 SELECT * INTO stay FROM public.reservations WHERE id=ord.reservation_id FOR UPDATE;
 SELECT * INTO m FROM public.market_orders WHERE order_id=oid FOR UPDATE;
 PERFORM 1 FROM public.guest_profiles WHERE id=stay.primary_guest_id AND organization_id=stay.organization_id AND user_id=who FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002';END IF;
 PERFORM service_private.guest_user(session_hash);
 prior:=service_private.service_command_replay(who,key,payload);
 IF prior IS NOT NULL THEN RETURN prior;END IF;
 IF m.revision IS DISTINCT FROM (body->>'expectedRevision')::integer THEN RAISE EXCEPTION 'SERVICE_REVISION_CHANGED' USING ERRCODE='23514';END IF;
 IF m.issue->>'status'='open' OR m.stage NOT IN ('handed_over','completed') THEN RAISE EXCEPTION 'SERVICE_TRANSITION_INVALID' USING ERRCODE='23514';END IF;
 UPDATE public.market_orders SET issue=jsonb_build_object('status','open','note',btrim(body->>'note'),'reportedAt',clock_timestamp()) WHERE order_id=oid;
 UPDATE public.market_orders SET revision=revision+1,updated_at=clock_timestamp() WHERE order_id=oid;
 result:=service_private.market_receipt(oid);
 PERFORM service_private.service_command_record(who,NULL,key,payload,result,ord.organization_id,oid,'market.report_issue');RETURN result;
END $$;
REVOKE ALL ON FUNCTION service_private.market_report_issue(text,uuid,uuid,jsonb) FROM PUBLIC;
CREATE OR REPLACE FUNCTION app.market_guest_act(session_hash text,oid uuid,key uuid,body jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF body->>'action'='confirm_receipt' THEN RETURN service_private.market_confirm_receipt(session_hash,oid,key,body);END IF;
 IF body->>'action'='report_issue' THEN RETURN service_private.market_report_issue(session_hash,oid,key,body);END IF;
 IF body->>'action' IN ('accept_proposal','decline_proposal') THEN RETURN service_private.market_proposal_act(session_hash,oid,key,body,false);END IF;
 IF body->>'action'='replace_order' THEN RETURN service_private.market_replace(session_hash,oid,key,body);END IF;
 RETURN service_private.market_act(session_hash,oid,key,body,false);
END $$;
COMMIT;
