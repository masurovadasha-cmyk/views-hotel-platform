BEGIN;
CREATE FUNCTION app.guest_cleaning_catalog(session_hash text,reservation uuid,after_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid:=service_private.guest_user(session_hash); stay public.reservations; rows jsonb;
BEGIN
 SELECT r.* INTO stay FROM public.reservations r JOIN public.guest_profiles g ON g.id=r.primary_guest_id AND g.organization_id=r.organization_id
 JOIN public.properties p ON p.id=r.property_id AND p.organization_id=r.organization_id WHERE r.id=reservation AND g.user_id=who;
 IF stay.id IS NULL THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF stay.status<>'checked_in' THEN RAISE EXCEPTION 'SERVICE_STAY_INELIGIBLE' USING ERRCODE='23514'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'currency',c.currency,'priceMinor',c.price_minor::text,'revision',c.revision,'durationMinutes',c.duration_minutes) ORDER BY c.id),'[]') INTO rows
 FROM (SELECT * FROM public.service_catalog WHERE organization_id=stay.organization_id AND property_id=stay.property_id AND currency=stay.currency
 AND active AND execution_kind='cleaning' AND price_minor>0 AND (after_id IS NULL OR id>after_id) ORDER BY id LIMIT 51) c;
 RETURN jsonb_build_object('items',rows,'pageSize',50);
END $$;
CREATE FUNCTION app.guest_cleaning_request(session_hash text,command_key uuid,body jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid:=service_private.guest_user(session_hash); stay public.reservations; svc public.service_catalog;
 reservation uuid:=(body->>'reservationId')::uuid; requested timestamptz:=(body->>'requestedFor')::timestamptz;
 prior jsonb; payload jsonb:=jsonb_build_object('kind','guest_request','body',body); result jsonb; oid uuid:=gen_random_uuid();
BEGIN
 IF jsonb_typeof(body)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(body))<>5 OR NOT body ?& ARRAY['reservationId','serviceId','expectedRevision','expectedPriceMinor','requestedFor'] THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 -- Verify ownership before replay, and lock it again before any write.
 PERFORM 1 FROM public.reservations r JOIN public.guest_profiles g ON g.id=r.primary_guest_id AND g.organization_id=r.organization_id WHERE r.id=reservation AND g.user_id=who;
 IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 prior:=service_private.service_command_replay(who,command_key,payload);
 IF prior IS NOT NULL THEN RETURN prior; END IF;
 SELECT r.* INTO stay FROM public.reservations r JOIN public.guest_profiles g ON g.id=r.primary_guest_id AND g.organization_id=r.organization_id
 JOIN public.properties p ON p.id=r.property_id AND p.organization_id=r.organization_id WHERE r.id=reservation AND g.user_id=who FOR UPDATE OF r FOR SHARE OF g;
 PERFORM service_private.guest_user(session_hash);
 IF stay.id IS NULL THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF stay.status<>'checked_in' OR stay.unit_id IS NULL THEN RAISE EXCEPTION 'SERVICE_STAY_INELIGIBLE' USING ERRCODE='23514'; END IF;
 SELECT * INTO svc FROM public.service_catalog WHERE id=(body->>'serviceId')::uuid AND organization_id=stay.organization_id AND property_id=stay.property_id AND currency=stay.currency FOR SHARE;
 IF svc.id IS NULL OR NOT svc.active OR svc.execution_kind IS DISTINCT FROM 'cleaning' OR svc.price_minor<=0 THEN RAISE EXCEPTION 'SERVICE_UNAVAILABLE' USING ERRCODE='23514'; END IF;
 IF svc.revision IS DISTINCT FROM (body->>'expectedRevision')::integer OR svc.price_minor::text IS DISTINCT FROM body->>'expectedPriceMinor' THEN RAISE EXCEPTION 'SERVICE_PRICE_CHANGED' USING ERRCODE='23514'; END IF;
 IF requested IS NULL OR NOT isfinite(requested) OR requested<clock_timestamp() OR requested<stay.check_in_at OR requested+make_interval(mins=>svc.duration_minutes)>stay.check_out_at THEN RAISE EXCEPTION 'SERVICE_TIME_INVALID' USING ERRCODE='23514'; END IF;
 INSERT INTO public.service_orders(id,organization_id,property_id,service_id,reservation_id,guest_profile_id,currency,quantity,total_minor,commission_minor,requested_for,snapshot,idempotency_key)
 VALUES(oid,stay.organization_id,stay.property_id,svc.id,stay.id,stay.primary_guest_id,svc.currency,1,svc.price_minor,floor(svc.price_minor::numeric*svc.commission_bps/10000)::bigint,requested,
 jsonb_build_object('schemaVersion',1,'execution','cleaning','name',svc.name,'catalogRevision',svc.revision,'priceMinor',svc.price_minor::text,'commissionBps',svc.commission_bps,'durationMinutes',svc.duration_minutes,'unitId',stay.unit_id,'paymentMode','folio_after_inspection','checklist',jsonb_build_array('linen','bathroom','floor')),'guest-service:'||who||':'||command_key);
 INSERT INTO public.service_cleaning_tasks(order_id,organization_id,property_id,scheduled_period) VALUES(oid,stay.organization_id,stay.property_id,tstzrange(requested,requested+make_interval(mins=>svc.duration_minutes),'[)'));
 result:=jsonb_build_object('orderId',oid,'status','requested','stage','requested','revision',1,'currency',svc.currency,'totalMinor',svc.price_minor::text,'idempotentReplay',false);
 PERFORM service_private.service_command_record(who,NULL,command_key,payload,result,stay.organization_id,oid,'service.requested');RETURN result;
END $$;
CREATE FUNCTION app.guest_cleaning_orders(session_hash text,reservation uuid,after_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid:=service_private.guest_user(session_hash); rows jsonb;
BEGIN
 PERFORM 1 FROM public.reservations r JOIN public.guest_profiles g ON g.id=r.primary_guest_id AND g.organization_id=r.organization_id WHERE r.id=reservation AND g.user_id=who;
 IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('orderId',o.id,'name',o.snapshot->'name','status',o.status,'stage',o.stage,'revision',o.revision,'requestedFor',o.requested_for,'currency',o.currency,'totalMinor',o.total_minor::text) ORDER BY o.id),'[]') INTO rows
 FROM (SELECT o.*,t.stage,t.revision FROM public.service_orders o JOIN public.service_cleaning_tasks t ON t.order_id=o.id
 JOIN public.reservations r ON r.id=o.reservation_id AND r.organization_id=o.organization_id AND r.property_id=o.property_id
 JOIN public.guest_profiles g ON g.id=r.primary_guest_id AND g.organization_id=r.organization_id
 WHERE r.id=reservation AND g.user_id=who AND (after_id IS NULL OR o.id>after_id) ORDER BY o.id LIMIT 51) o;
 RETURN jsonb_build_object('items',rows,'pageSize',50);
END $$;
REVOKE ALL ON FUNCTION app.guest_cleaning_catalog(text,uuid,uuid),app.guest_cleaning_request(text,uuid,jsonb),app.guest_cleaning_orders(text,uuid,uuid) FROM PUBLIC;
COMMIT;
