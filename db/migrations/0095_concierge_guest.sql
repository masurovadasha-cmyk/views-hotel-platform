BEGIN;
CREATE FUNCTION app.concierge_request(session_hash text,key uuid,body jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid:=service_private.guest_user(session_hash);stay public.reservations;svc public.service_catalog;oid uuid:=gen_random_uuid();at_time timestamptz;
 payload jsonb:=jsonb_build_object('kind','concierge_request','body',body);prior jsonb;result jsonb;
BEGIN
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM ARRAY['budgetMinor','category','message','partySize','requestedFor','reservationId']
 OR body->>'category' NOT IN ('restaurant','documents','help') OR jsonb_typeof(body->'category') IS DISTINCT FROM 'string'
 OR jsonb_typeof(body->'partySize') IS DISTINCT FROM 'number' OR body->>'partySize' !~ '^([1-9]|[1-4][0-9]|50)$'
 OR jsonb_typeof(body->'budgetMinor') IS DISTINCT FROM 'string' OR body->>'budgetMinor' !~ '^(0|[1-9][0-9]{0,18})$'
 OR jsonb_typeof(body->'message') IS DISTINCT FROM 'string' OR length(btrim(body->>'message')) NOT BETWEEN 1 AND 500 OR body->>'message' ~ '[[:cntrl:]]'
 THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023';END IF;
 PERFORM 1 FROM public.reservations r JOIN public.guest_profiles g ON g.id=r.primary_guest_id AND g.organization_id=r.organization_id WHERE r.id=(body->>'reservationId')::uuid AND g.user_id=who;
 IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002';END IF;
 prior:=service_private.service_command_replay(who,key,payload);IF prior IS NOT NULL THEN RETURN prior;END IF;
 SELECT r.* INTO stay FROM public.reservations r JOIN public.guest_profiles g ON g.id=r.primary_guest_id AND g.organization_id=r.organization_id WHERE r.id=(body->>'reservationId')::uuid AND g.user_id=who FOR UPDATE OF r FOR SHARE OF g;
 PERFORM service_private.guest_user(session_hash);
 IF stay.id IS NULL THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002';END IF;
 IF stay.status<>'checked_in' OR stay.unit_id IS NULL THEN RAISE EXCEPTION 'SERVICE_STAY_INELIGIBLE' USING ERRCODE='23514';END IF;
 at_time:=(body->>'requestedFor')::timestamptz;
 IF at_time IS NULL OR NOT isfinite(at_time) OR at_time<clock_timestamp() OR at_time>=stay.check_out_at THEN RAISE EXCEPTION 'SERVICE_TIME_INVALID' USING ERRCODE='23514';END IF;
 -- Explicit property opt-in: no implicit service or external booking is created.
 SELECT * INTO svc FROM public.service_catalog WHERE organization_id=stay.organization_id AND property_id=stay.property_id AND currency=stay.currency AND execution_kind='concierge' AND active AND price_minor=0 ORDER BY id LIMIT 1 FOR SHARE;
 IF svc.id IS NULL THEN RAISE EXCEPTION 'SERVICE_UNAVAILABLE' USING ERRCODE='23514';END IF;
 INSERT INTO public.service_orders(id,organization_id,property_id,service_id,reservation_id,guest_profile_id,currency,quantity,total_minor,commission_minor,requested_for,snapshot,idempotency_key)
 VALUES(oid,stay.organization_id,stay.property_id,svc.id,stay.id,stay.primary_guest_id,stay.currency,1,0,0,at_time,jsonb_build_object('execution','concierge','name',svc.name,'unitId',stay.unit_id,'paymentMode','no_charge','responseMinutes',15,'slaHypothesis',true),'concierge:'||who||':'||key);
 INSERT INTO public.concierge_requests(order_id,organization_id,property_id,category,party_size,budget_minor,response_due_at) VALUES(oid,stay.organization_id,stay.property_id,body->>'category',(body->>'partySize')::integer,(body->>'budgetMinor')::bigint,clock_timestamp()+interval '15 minutes');
 INSERT INTO public.concierge_messages(organization_id,property_id,order_id,author_kind,body) VALUES(stay.organization_id,stay.property_id,oid,'guest',btrim(body->>'message'));
 result:=service_private.concierge_receipt(oid);PERFORM service_private.service_command_record(who,NULL,key,payload,result,stay.organization_id,oid,'concierge.requested');RETURN result;
END $$;
CREATE FUNCTION app.concierge_guest_list(session_hash text,reservation uuid,after_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid:=service_private.guest_user(session_hash);rows jsonb;
BEGIN
 PERFORM 1 FROM public.reservations r JOIN public.guest_profiles g ON g.id=r.primary_guest_id AND g.organization_id=r.organization_id WHERE r.id=reservation AND g.user_id=who;
 IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002';END IF;
 SELECT coalesce(jsonb_agg(service_private.concierge_receipt(q.order_id) ORDER BY q.order_id),'[]') INTO rows FROM (SELECT c.order_id FROM public.concierge_requests c JOIN public.service_orders o ON o.id=c.order_id WHERE o.reservation_id=reservation AND (after_id IS NULL OR c.order_id>after_id) ORDER BY c.order_id LIMIT 51) q;
 RETURN jsonb_build_object('items',rows);
END $$;
REVOKE ALL ON FUNCTION app.concierge_request(text,uuid,jsonb),app.concierge_guest_list(text,uuid,uuid) FROM PUBLIC;
COMMIT;
