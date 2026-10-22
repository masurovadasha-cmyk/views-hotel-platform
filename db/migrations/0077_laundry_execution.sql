BEGIN;
CREATE FUNCTION service_private.laundry_act(session_hash text,iid uuid,key uuid,body jsonb,staff boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid; mid uuid; i public.laundry_intakes; stay public.reservations; folio public.guest_folios;
 action text:=body->>'action'; payload jsonb; prior jsonb; total numeric; return_time timestamptz; oid uuid; eid uuid;
BEGIN
 IF staff THEN who:=service_private.staff_user(session_hash);mid:=app.current_membership_id(); ELSE who:=service_private.guest_user(session_hash); END IF;
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR action IS NULL OR jsonb_typeof(body->'expectedRevision') IS DISTINCT FROM 'number' OR (body->>'expectedRevision')::integer<1 THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 IF (action='quote' AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM ARRAY['action','expectedRevision','items','returnBy']) OR
 (action='accept' AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM ARRAY['action','expectedRevision','expectedTotalMinor']) OR
 (action NOT IN ('quote','accept') AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM ARRAY['action','expectedRevision']) THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 SELECT * INTO i FROM public.laundry_intakes WHERE id=iid;
 IF i.id IS NULL THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF staff THEN
  IF NOT app.registry_access(i.organization_id,i.property_id,'reservation.manage') THEN RAISE EXCEPTION 'SERVICE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 ELSE
  PERFORM 1 FROM public.reservations r JOIN public.guest_profiles g ON g.id=r.primary_guest_id AND g.organization_id=r.organization_id WHERE r.id=i.reservation_id AND g.user_id=who;
  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 END IF;
 payload:=jsonb_build_object('kind','laundry_action','staff',staff,'membershipId',mid,'intakeId',iid,'body',body);
 prior:=service_private.service_command_replay(who,key,payload);IF prior IS NOT NULL THEN RETURN prior; END IF;
 SELECT * INTO stay FROM public.reservations WHERE id=i.reservation_id FOR UPDATE;
 SELECT * INTO i FROM public.laundry_intakes WHERE id=iid FOR UPDATE;
 IF staff THEN
  PERFORM service_private.staff_user(session_hash);
  IF NOT app.registry_access(i.organization_id,i.property_id,'reservation.manage') THEN RAISE EXCEPTION 'SERVICE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 ELSE
  PERFORM service_private.guest_user(session_hash);
  PERFORM 1 FROM public.guest_profiles WHERE id=stay.primary_guest_id AND organization_id=stay.organization_id AND user_id=who FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 END IF;
 IF i.revision IS DISTINCT FROM (body->>'expectedRevision')::integer THEN RAISE EXCEPTION 'SERVICE_REVISION_CHANGED' USING ERRCODE='23514'; END IF;
 IF staff AND action='receive' AND i.stage='requested' THEN
  UPDATE public.laundry_intakes SET stage='received' WHERE id=iid;
 ELSIF staff AND action='quote' AND i.stage IN ('received','quoted') THEN
  IF jsonb_typeof(body->'items') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023'; END IF;
  IF jsonb_array_length(body->'items') NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(body->'items') x WHERE jsonb_typeof(x)<>'object') THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(body->'items') x WHERE
   (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(x) k) IS DISTINCT FROM ARRAY['description','priceMinor','tag']
   OR jsonb_typeof(x->'tag') IS DISTINCT FROM 'string' OR x->>'tag' !~ '^[A-Z0-9-]{1,24}$'
   OR jsonb_typeof(x->'description') IS DISTINCT FROM 'string' OR length(btrim(x->>'description')) NOT BETWEEN 1 AND 160 OR x->>'description' ~ '[[:cntrl:]]'
   OR jsonb_typeof(x->'priceMinor') IS DISTINCT FROM 'string' OR x->>'priceMinor' !~ '^[1-9][0-9]{0,18}$')
   OR (SELECT count(DISTINCT x->>'tag') FROM jsonb_array_elements(body->'items') x)<>jsonb_array_length(body->'items') THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023'; END IF;
  SELECT sum((x->>'priceMinor')::numeric) INTO total FROM jsonb_array_elements(body->'items') x;
  IF total>9223372036854775807 THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023'; END IF;
  return_time:=(body->>'returnBy')::timestamptz;
  IF return_time IS NULL OR NOT isfinite(return_time) OR return_time<=greatest(i.pickup_at,clock_timestamp()) OR return_time>stay.check_out_at OR stay.status<>'checked_in' THEN RAISE EXCEPTION 'SERVICE_TIME_INVALID' USING ERRCODE='23514'; END IF;
  UPDATE public.laundry_intakes SET stage='quoted',items=body->'items',total_minor=total::bigint,return_by=return_time WHERE id=iid;
 ELSIF NOT staff AND action='accept' AND i.stage='quoted' THEN
  IF i.total_minor::text IS DISTINCT FROM body->>'expectedTotalMinor' THEN RAISE EXCEPTION 'SERVICE_PRICE_CHANGED' USING ERRCODE='23514'; END IF;
  IF stay.status<>'checked_in' OR i.return_by<=clock_timestamp() THEN RAISE EXCEPTION 'SERVICE_STAY_INELIGIBLE' USING ERRCODE='23514'; END IF;
  oid:=gen_random_uuid();
  INSERT INTO public.service_orders(id,organization_id,property_id,service_id,reservation_id,guest_profile_id,currency,quantity,total_minor,commission_minor,requested_for,snapshot,idempotency_key)
  VALUES(oid,i.organization_id,i.property_id,i.service_id,i.reservation_id,stay.primary_guest_id,i.currency,1,i.total_minor,floor(i.total_minor::numeric*i.commission_bps/10000)::bigint,i.pickup_at,
   jsonb_build_object('execution','laundry','intakeId',iid,'quoteRevision',i.revision,'items',i.items,'name',i.name,'returnBy',i.return_by,'paymentMode','folio_after_guest_receipt'),'laundry:'||iid);
  UPDATE public.service_orders SET status='accepted' WHERE id=oid;
  UPDATE public.laundry_intakes SET stage='accepted',order_id=oid WHERE id=iid;
 ELSIF NOT staff AND action='reject' AND i.stage='quoted' THEN
  UPDATE public.laundry_intakes SET stage='awaiting_return' WHERE id=iid;
 ELSIF NOT staff AND action='cancel' AND i.stage='requested' THEN
  UPDATE public.laundry_intakes SET stage='cancelled' WHERE id=iid;
 ELSIF staff AND action='return_unprocessed' AND i.stage IN ('received','quoted','awaiting_return') THEN
  UPDATE public.laundry_intakes SET stage='cancelled' WHERE id=iid;
 ELSIF staff AND action='wash' AND i.stage='accepted' THEN
  UPDATE public.service_orders SET status='in_progress' WHERE id=i.order_id;
  UPDATE public.laundry_intakes SET stage='washing' WHERE id=iid;
 ELSIF staff AND action='ready' AND i.stage='washing' THEN
  UPDATE public.laundry_intakes SET stage='ready' WHERE id=iid;
 ELSIF staff AND action='deliver' AND i.stage='ready' THEN
  UPDATE public.laundry_intakes SET stage='delivered' WHERE id=iid;
 ELSIF NOT staff AND action='confirm_receipt' AND i.stage='delivered' THEN
  SELECT * INTO folio FROM public.guest_folios WHERE reservation_id=i.reservation_id AND organization_id=i.organization_id FOR UPDATE;
  IF folio.id IS NULL THEN INSERT INTO public.guest_folios(organization_id,property_id,reservation_id,currency) VALUES(i.organization_id,i.property_id,i.reservation_id,i.currency) RETURNING * INTO folio;
  ELSIF folio.status<>'open' THEN RAISE EXCEPTION 'FOLIO_NOT_OPEN' USING ERRCODE='23514'; END IF;
  eid:=gen_random_uuid();
  INSERT INTO public.folio_entries(id,organization_id,property_id,folio_id,currency,kind,amount_minor,label,source_type,source_id,idempotency_key,policy_snapshot)
  SELECT eid,o.organization_id,o.property_id,folio.id,o.currency,'service',o.total_minor,o.snapshot->'name','service_order',o.id,'service-order:'||o.id,o.snapshot FROM public.service_orders o WHERE o.id=i.order_id;
  UPDATE public.laundry_intakes SET stage='closed',folio_entry_id=eid WHERE id=iid;
  UPDATE public.service_orders SET status='completed' WHERE id=i.order_id;
 ELSE RAISE EXCEPTION 'SERVICE_TRANSITION_INVALID' USING ERRCODE='23514'; END IF;
 UPDATE public.laundry_intakes SET revision=revision+1,updated_at=clock_timestamp() WHERE id=iid RETURNING * INTO i;
 RETURN service_private.laundry_record(who,mid,key,payload,i,'laundry.'||action);
END $$;
CREATE FUNCTION app.laundry_guest_act(session_hash text,iid uuid,key uuid,body jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT service_private.laundry_act(session_hash,iid,key,body,false) $$;
CREATE FUNCTION app.laundry_staff_act(session_hash text,iid uuid,key uuid,body jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT service_private.laundry_act(session_hash,iid,key,body,true) $$;
REVOKE ALL ON FUNCTION service_private.laundry_act(text,uuid,uuid,jsonb,boolean),app.laundry_guest_act(text,uuid,uuid,jsonb),app.laundry_staff_act(text,uuid,uuid,jsonb) FROM PUBLIC;
COMMIT;
