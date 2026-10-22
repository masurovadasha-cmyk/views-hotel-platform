BEGIN;
-- Preserve private feedback replay while reauthorizing after existing locks.
CREATE OR REPLACE FUNCTION app.guest_service_feedback(session_hash text,oid uuid,command_key uuid,body jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid:=service_private.guest_user(session_hash); ord public.service_orders; task public.service_cleaning_tasks;
 payload jsonb:=jsonb_build_object('kind','guest_feedback','orderId',oid,'body',body); prior jsonb; result jsonb;
BEGIN
 IF jsonb_typeof(body) IS DISTINCT FROM 'object'
 OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM ARRAY['comment','rating']
 OR jsonb_typeof(body->'rating') IS DISTINCT FROM 'number' OR (body->>'rating') !~ '^[1-5]$'
 OR jsonb_typeof(body->'comment') IS DISTINCT FROM 'string' OR length(body->>'comment')>500 OR body->>'comment' ~ '[[:cntrl:]]'
 THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 SELECT o.* INTO ord FROM public.service_orders o
 JOIN public.reservations r ON r.id=o.reservation_id AND r.organization_id=o.organization_id AND r.property_id=o.property_id
 JOIN public.guest_profiles g ON g.id=r.primary_guest_id AND g.organization_id=r.organization_id
 WHERE o.id=oid AND g.user_id=who;
 IF ord.id IS NULL THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 prior:=service_private.service_command_replay(who,command_key,payload);
 PERFORM 1 FROM public.reservations r JOIN public.guest_profiles g ON g.id=r.primary_guest_id AND g.organization_id=r.organization_id
 WHERE r.id=ord.reservation_id AND g.user_id=who FOR UPDATE OF r FOR SHARE OF g;
 IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT * INTO ord FROM public.service_orders WHERE id=oid FOR UPDATE;
 SELECT * INTO task FROM public.service_cleaning_tasks WHERE order_id=oid FOR UPDATE;
 PERFORM service_private.guest_user(session_hash);
 -- Cached receipts require current access after every explicit lock wait.
 IF prior IS NOT NULL THEN RETURN prior; END IF;
 IF ord.status<>'completed' OR task.order_id IS NULL OR task.stage<>'done' OR task.folio_entry_id IS NULL THEN RAISE EXCEPTION 'SERVICE_FEEDBACK_NOT_READY' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM public.service_order_feedback WHERE order_id=oid) THEN RAISE EXCEPTION 'SERVICE_FEEDBACK_EXISTS' USING ERRCODE='23514'; END IF;
 INSERT INTO public.service_order_feedback(order_id,organization_id,property_id,author_user_id,rating,comment)
 VALUES(oid,ord.organization_id,ord.property_id,who,(body->>'rating')::smallint,btrim(body->>'comment'));
 result:=jsonb_build_object('orderId',oid,'revision',task.revision,'rating',(body->>'rating')::integer,'idempotentReplay',false);
 PERFORM service_private.service_command_record(who,NULL,command_key,payload,result,ord.organization_id,oid,'service.feedback_submitted');RETURN result;
END $$;
REVOKE ALL ON FUNCTION app.guest_service_feedback(text,uuid,uuid,jsonb) FROM PUBLIC;
COMMIT;
