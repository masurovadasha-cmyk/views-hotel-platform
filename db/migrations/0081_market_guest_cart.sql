BEGIN;
CREATE FUNCTION app.market_catalog(session_hash text,reservation uuid,after_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid:=service_private.guest_user(session_hash); stay public.reservations; result jsonb;
BEGIN
 SELECT r.* INTO stay FROM public.reservations r JOIN public.guest_profiles g ON g.id=r.primary_guest_id AND g.organization_id=r.organization_id WHERE r.id=reservation AND g.user_id=who;
 IF stay.id IS NULL THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF stay.status<>'checked_in' OR stay.unit_id IS NULL THEN RAISE EXCEPTION 'SERVICE_STAY_INELIGIBLE' USING ERRCODE='23514'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'priceMinor',c.price_minor::text,'currency',c.currency,'revision',c.revision,'availableQuantity',c.available::text) ORDER BY c.id),'[]') INTO result
 FROM (SELECT c.*,greatest(0,coalesce(b.quantity,0)-service_private.market_reserved(p.item_id)) available FROM public.service_catalog c
 JOIN public.market_products p ON p.service_id=c.id JOIN public.supply_items i ON i.id=p.item_id LEFT JOIN public.supply_balances b ON b.item_id=i.id
 WHERE c.organization_id=stay.organization_id AND c.property_id=stay.property_id AND c.currency=stay.currency AND c.active AND c.execution_kind='market' AND c.price_minor>0 AND i.unit='piece'
 AND (after_id IS NULL OR c.id>after_id) ORDER BY c.id LIMIT 51) c;
 RETURN jsonb_build_object('items',result);
END $$;
CREATE FUNCTION app.market_request(session_hash text,command_key uuid,body jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid:=service_private.guest_user(session_hash); stay public.reservations; prior jsonb; payload jsonb:=jsonb_build_object('kind','market_request','body',body);
 oid uuid:=gen_random_uuid(); svc record; line jsonb; lines jsonb:='[]'; total numeric:=0; commissions numeric:=0; first_service uuid; count_lines integer:=0; result jsonb;
BEGIN
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM ARRAY['expectedTotalMinor','lines','reservationId'] OR jsonb_typeof(body->'lines') IS DISTINCT FROM 'array' OR jsonb_typeof(body->'expectedTotalMinor') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(body->'lines') NOT BETWEEN 1 AND 20 OR body->>'expectedTotalMinor' !~ '^[1-9][0-9]{0,18}$' THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 FOR line IN SELECT * FROM jsonb_array_elements(body->'lines') LOOP
  IF jsonb_typeof(line) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(line) k) IS DISTINCT FROM ARRAY['expectedRevision','quantity','serviceId'] OR jsonb_typeof(line->'quantity') IS DISTINCT FROM 'number' OR line->>'quantity' !~ '^([1-9]|[1-4][0-9]|50)$' OR jsonb_typeof(line->'expectedRevision') IS DISTINCT FROM 'number' OR line->>'expectedRevision' !~ '^[1-9][0-9]*$' THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF (SELECT count(DISTINCT (l->>'serviceId')::uuid) FROM jsonb_array_elements(body->'lines') l)<>jsonb_array_length(body->'lines') THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 SELECT r.* INTO stay FROM public.reservations r JOIN public.guest_profiles g ON g.id=r.primary_guest_id AND g.organization_id=r.organization_id WHERE r.id=(body->>'reservationId')::uuid AND g.user_id=who;
 IF stay.id IS NULL THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 prior:=service_private.service_command_replay(who,command_key,payload);IF prior IS NOT NULL THEN RETURN prior; END IF;
 SELECT * INTO stay FROM public.reservations WHERE id=stay.id FOR UPDATE;
 PERFORM service_private.guest_user(session_hash);
 PERFORM 1 FROM public.guest_profiles WHERE id=stay.primary_guest_id AND organization_id=stay.organization_id AND user_id=who FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF stay.status<>'checked_in' OR stay.unit_id IS NULL OR stay.check_out_at<=clock_timestamp() THEN RAISE EXCEPTION 'SERVICE_STAY_INELIGIBLE' USING ERRCODE='23514'; END IF;
 -- Lock catalog before stock. Sorting by item prevents reversed-cart deadlocks.
 FOR svc IN SELECT c.*,p.item_id FROM public.service_catalog c JOIN public.market_products p ON p.service_id=c.id
 WHERE c.id IN (SELECT (l->>'serviceId')::uuid FROM jsonb_array_elements(body->'lines') l)
 AND c.organization_id=stay.organization_id AND c.property_id=stay.property_id AND c.currency=stay.currency ORDER BY p.item_id FOR SHARE OF c,p LOOP
  IF NOT svc.active OR svc.execution_kind IS DISTINCT FROM 'market' OR svc.price_minor<=0 THEN RAISE EXCEPTION 'SERVICE_UNAVAILABLE' USING ERRCODE='23514'; END IF;
  SELECT l INTO line FROM jsonb_array_elements(body->'lines') l WHERE (l->>'serviceId')::uuid=svc.id;
  IF svc.revision IS DISTINCT FROM (line->>'expectedRevision')::integer THEN RAISE EXCEPTION 'SERVICE_PRICE_CHANGED' USING ERRCODE='23514'; END IF;
  PERFORM 1 FROM public.supply_items WHERE id=svc.item_id AND organization_id=stay.organization_id AND property_id=stay.property_id AND unit='piece' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_UNAVAILABLE' USING ERRCODE='23514'; END IF;
  IF coalesce((SELECT quantity FROM public.supply_balances WHERE item_id=svc.item_id),0)-service_private.market_reserved(svc.item_id)<(line->>'quantity')::integer THEN RAISE EXCEPTION 'SERVICE_STOCK_UNAVAILABLE' USING ERRCODE='23514'; END IF;
  total:=total+svc.price_minor::numeric*(line->>'quantity')::integer;
  commissions:=commissions+floor(svc.price_minor::numeric*(line->>'quantity')::integer*svc.commission_bps/10000);
  first_service:=coalesce(first_service,svc.id);count_lines:=count_lines+1;
  lines:=lines||jsonb_build_array(jsonb_build_object('serviceId',svc.id,'itemId',svc.item_id,'name',svc.name,'quantity',(line->>'quantity')::integer,'priceMinor',svc.price_minor::text,'catalogRevision',svc.revision));
 END LOOP;
 IF count_lines<>jsonb_array_length(body->'lines') THEN RAISE EXCEPTION 'SERVICE_UNAVAILABLE' USING ERRCODE='23514'; END IF;
 IF total>9223372036854775807 OR total::text IS DISTINCT FROM body->>'expectedTotalMinor' THEN RAISE EXCEPTION 'SERVICE_PRICE_CHANGED' USING ERRCODE='23514'; END IF;
 INSERT INTO public.service_orders(id,organization_id,property_id,service_id,reservation_id,guest_profile_id,currency,quantity,total_minor,commission_minor,requested_for,snapshot,idempotency_key)
 VALUES(oid,stay.organization_id,stay.property_id,first_service,stay.id,stay.primary_guest_id,stay.currency,1,total::bigint,commissions::bigint,clock_timestamp(),jsonb_build_object('execution','market','name',jsonb_build_object('en','V Market','ru','V Market','uz','V Market'),'lines',lines,'substitutions',false,'deliveryMinor','0','paymentMode','folio_after_guest_receipt'),'market:'||who||':'||command_key);
 INSERT INTO public.market_orders(order_id,organization_id,property_id) VALUES(oid,stay.organization_id,stay.property_id);
 INSERT INTO public.market_order_lines(organization_id,property_id,order_id,item_id,quantity) SELECT stay.organization_id,stay.property_id,oid,(l->>'itemId')::uuid,(l->>'quantity')::integer FROM jsonb_array_elements(lines) l;
 result:=service_private.market_receipt(oid);
 PERFORM service_private.service_command_record(who,NULL,command_key,payload,result,stay.organization_id,oid,'market.requested');RETURN result;
END $$;
REVOKE ALL ON FUNCTION app.market_catalog(text,uuid,uuid),app.market_request(text,uuid,jsonb) FROM PUBLIC;
COMMIT;
