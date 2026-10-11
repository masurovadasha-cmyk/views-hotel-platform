BEGIN;
CREATE FUNCTION app.laundry_request(session_hash text,command_key uuid,body jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid:=service_private.guest_user(session_hash); stay public.reservations; svc public.service_catalog; i public.laundry_intakes;
 prior jsonb; payload jsonb:=jsonb_build_object('kind','laundry_request','body',body); pickup timestamptz; count_items integer;
BEGIN
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM ARRAY['declaredCount','expectedRevision','pickupAt','preferences','reservationId','serviceId']
 OR jsonb_typeof(body->'preferences') IS DISTINCT FROM 'string' OR length(body->>'preferences')>500 OR body->>'preferences' ~ '[[:cntrl:]]'
 OR (body->>'declaredCount') !~ '^([1-9]|[1-4][0-9]|50)$' THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM public.reservations r JOIN public.guest_profiles g ON g.id=r.primary_guest_id AND g.organization_id=r.organization_id WHERE r.id=(body->>'reservationId')::uuid AND g.user_id=who;
 IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 prior:=service_private.service_command_replay(who,command_key,payload);IF prior IS NOT NULL THEN RETURN prior; END IF;
 SELECT r.* INTO stay FROM public.reservations r JOIN public.guest_profiles g ON g.id=r.primary_guest_id AND g.organization_id=r.organization_id
 WHERE r.id=(body->>'reservationId')::uuid AND g.user_id=who FOR UPDATE OF r FOR SHARE OF g;
 PERFORM service_private.guest_user(session_hash);
 IF stay.id IS NULL THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF stay.status<>'checked_in' OR stay.unit_id IS NULL THEN RAISE EXCEPTION 'SERVICE_STAY_INELIGIBLE' USING ERRCODE='23514'; END IF;
 SELECT * INTO svc FROM public.service_catalog WHERE id=(body->>'serviceId')::uuid AND organization_id=stay.organization_id AND property_id=stay.property_id AND currency=stay.currency FOR SHARE;
 IF svc.id IS NULL OR NOT svc.active OR svc.execution_kind IS DISTINCT FROM 'laundry' OR svc.price_minor<=0 THEN RAISE EXCEPTION 'SERVICE_UNAVAILABLE' USING ERRCODE='23514'; END IF;
 IF svc.revision IS DISTINCT FROM (body->>'expectedRevision')::integer THEN RAISE EXCEPTION 'SERVICE_PRICE_CHANGED' USING ERRCODE='23514'; END IF;
 pickup:=(body->>'pickupAt')::timestamptz;count_items:=(body->>'declaredCount')::integer;
 IF pickup IS NULL OR NOT isfinite(pickup) OR pickup<clock_timestamp() OR pickup<stay.check_in_at OR pickup>=stay.check_out_at THEN RAISE EXCEPTION 'SERVICE_TIME_INVALID' USING ERRCODE='23514'; END IF;
 INSERT INTO public.laundry_intakes(organization_id,property_id,reservation_id,service_id,currency,declared_count,preferences,pickup_at,estimate_minor,name,commission_bps)
 VALUES(stay.organization_id,stay.property_id,stay.id,svc.id,svc.currency,count_items,btrim(body->>'preferences'),pickup,svc.price_minor*count_items,svc.name,svc.commission_bps) RETURNING * INTO i;
 RETURN service_private.laundry_record(who,NULL,command_key,payload,i,'laundry.requested');
END $$;
CREATE FUNCTION app.laundry_guest_list(session_hash text,reservation uuid,after_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid:=service_private.guest_user(session_hash); result jsonb;
BEGIN
 PERFORM 1 FROM public.reservations r JOIN public.guest_profiles g ON g.id=r.primary_guest_id AND g.organization_id=r.organization_id WHERE r.id=reservation AND g.user_id=who;
 IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT coalesce(jsonb_agg(service_private.laundry_receipt(i) ORDER BY i.id),'[]') INTO result FROM (SELECT * FROM public.laundry_intakes WHERE reservation_id=reservation AND (after_id IS NULL OR id>after_id) ORDER BY id LIMIT 51) i;
 RETURN jsonb_build_object('items',result);
END $$;
CREATE FUNCTION app.laundry_staff_list(session_hash text,property uuid,after_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid:=service_private.staff_user(session_hash); result jsonb;
BEGIN
 IF NOT app.registry_access(app.current_organization_id(),property,'reservation.manage') THEN RAISE EXCEPTION 'SERVICE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(service_private.laundry_receipt(i) ORDER BY i.id),'[]') INTO result FROM (SELECT * FROM public.laundry_intakes WHERE organization_id=app.current_organization_id() AND property_id=property AND (after_id IS NULL OR id>after_id) ORDER BY id LIMIT 51) i;
 RETURN jsonb_build_object('items',result);
END $$;
REVOKE ALL ON FUNCTION app.laundry_request(text,uuid,jsonb),app.laundry_guest_list(text,uuid,uuid),app.laundry_staff_list(text,uuid,uuid) FROM PUBLIC;
CREATE FUNCTION app.laundry_catalog(session_hash text,reservation uuid,after_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid:=service_private.guest_user(session_hash); stay public.reservations; rows jsonb;
BEGIN
 SELECT r.* INTO stay FROM public.reservations r JOIN public.guest_profiles g ON g.id=r.primary_guest_id AND g.organization_id=r.organization_id
 JOIN public.properties p ON p.id=r.property_id AND p.organization_id=r.organization_id WHERE r.id=reservation AND g.user_id=who;
 IF stay.id IS NULL THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF stay.status<>'checked_in' THEN RAISE EXCEPTION 'SERVICE_STAY_INELIGIBLE' USING ERRCODE='23514'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'currency',c.currency,'priceMinor',c.price_minor::text,'revision',c.revision,'durationMinutes',c.duration_minutes) ORDER BY c.id),'[]') INTO rows
 FROM (SELECT * FROM public.service_catalog WHERE organization_id=stay.organization_id AND property_id=stay.property_id AND currency=stay.currency
 AND active AND execution_kind='laundry' AND price_minor>0 AND (after_id IS NULL OR id>after_id) ORDER BY id LIMIT 51) c;
 RETURN jsonb_build_object('items',rows,'pageSize',50);
END $$;
REVOKE ALL ON FUNCTION app.laundry_catalog(text,uuid,uuid) FROM PUBLIC;
COMMIT;
