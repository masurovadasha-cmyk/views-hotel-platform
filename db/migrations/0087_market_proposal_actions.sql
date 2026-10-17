BEGIN;
CREATE FUNCTION service_private.market_proposal_act(session_hash text,oid uuid,key uuid,body jsonb,staff boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid; mid uuid; ord public.service_orders; stay public.reservations; m public.market_orders;
 action text:=body->>'action'; payload jsonb; prior jsonb; result jsonb; draft jsonb; quoted jsonb:='[]'; request_lines jsonb;
 svc record; line jsonb; total numeric:=0; expected_keys text[];
BEGIN
 IF staff THEN who:=service_private.staff_user(session_hash);mid:=app.current_membership_id();ELSE who:=service_private.guest_user(session_hash);END IF;
 expected_keys:=CASE WHEN staff AND action='propose_replacement' THEN ARRAY['action','expectedRevision','fromServiceId','note','toServiceId'] WHEN NOT staff AND action='accept_proposal' THEN ARRAY['action','expectedRevision','expectedTotalMinor'] WHEN staff AND action='withdraw_proposal' OR NOT staff AND action='decline_proposal' THEN ARRAY['action','expectedRevision'] END;
 IF expected_keys IS NULL OR jsonb_typeof(body) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM expected_keys OR jsonb_typeof(body->'expectedRevision') IS DISTINCT FROM 'number' OR body->>'expectedRevision' !~ '^[1-9][0-9]*$' THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023';END IF;
 SELECT o.* INTO ord FROM public.service_orders o JOIN public.market_orders linked ON linked.order_id=o.id WHERE o.id=oid;
 IF ord.id IS NULL THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002';END IF;
 IF staff THEN
  IF NOT app.registry_access(ord.organization_id,ord.property_id,'stock.manage') THEN RAISE EXCEPTION 'SERVICE_FORBIDDEN' USING ERRCODE='42501';END IF;
 ELSE
  PERFORM 1 FROM public.reservations r JOIN public.guest_profiles g ON g.id=r.primary_guest_id AND g.organization_id=r.organization_id WHERE r.id=ord.reservation_id AND g.user_id=who;
  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002';END IF;
 END IF;
 payload:=jsonb_build_object('kind','market_proposal','staff',staff,'membershipId',mid,'orderId',oid,'body',body);
 prior:=service_private.service_command_replay(who,key,payload);IF prior IS NOT NULL THEN RETURN prior;END IF;
 SELECT * INTO stay FROM public.reservations WHERE id=ord.reservation_id FOR UPDATE;
 SELECT * INTO m FROM public.market_orders WHERE order_id=oid FOR UPDATE;
 IF staff THEN
  PERFORM service_private.staff_user(session_hash);
  IF NOT app.registry_access(ord.organization_id,ord.property_id,'stock.manage') THEN RAISE EXCEPTION 'SERVICE_FORBIDDEN' USING ERRCODE='42501';END IF;
 ELSE
  PERFORM service_private.guest_user(session_hash);
  PERFORM 1 FROM public.guest_profiles WHERE id=stay.primary_guest_id AND organization_id=stay.organization_id AND user_id=who FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002';END IF;
 END IF;
 IF m.revision IS DISTINCT FROM (body->>'expectedRevision')::integer THEN RAISE EXCEPTION 'SERVICE_REVISION_CHANGED' USING ERRCODE='23514';END IF;
 IF m.stage<>'reserved' THEN RAISE EXCEPTION 'SERVICE_TRANSITION_INVALID' USING ERRCODE='23514';END IF;
 IF action='propose_replacement' THEN
  IF m.proposal->>'status'='pending' THEN RAISE EXCEPTION 'SERVICE_TRANSITION_INVALID' USING ERRCODE='23514';END IF;
  IF stay.status<>'checked_in' OR stay.check_out_at<=clock_timestamp() THEN RAISE EXCEPTION 'SERVICE_STAY_INELIGIBLE' USING ERRCODE='23514';END IF;
  IF jsonb_typeof(body->'note') IS DISTINCT FROM 'string' OR length(btrim(body->>'note')) NOT BETWEEN 3 AND 500 OR (body->>'fromServiceId')::uuid IS NOT DISTINCT FROM (body->>'toServiceId')::uuid THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023';END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(ord.snapshot->'lines') l WHERE (l->>'serviceId')::uuid=(body->>'fromServiceId')::uuid) OR EXISTS(SELECT 1 FROM jsonb_array_elements(ord.snapshot->'lines') l WHERE (l->>'serviceId')::uuid=(body->>'toServiceId')::uuid) THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023';END IF;
  SELECT jsonb_agg(jsonb_build_object('serviceId',CASE WHEN (l->>'serviceId')::uuid=(body->>'fromServiceId')::uuid THEN (body->>'toServiceId')::uuid ELSE (l->>'serviceId')::uuid END,'quantity',l->'quantity')) INTO draft FROM jsonb_array_elements(ord.snapshot->'lines') l;
  FOR svc IN SELECT c.*,p.item_id FROM public.service_catalog c JOIN public.market_products p ON p.service_id=c.id JOIN public.supply_items i ON i.id=p.item_id
   WHERE c.organization_id=ord.organization_id AND c.property_id=ord.property_id AND c.currency=ord.currency AND c.active AND c.execution_kind='market' AND c.price_minor>0 AND i.unit='piece'
   AND c.id IN (SELECT (l->>'serviceId')::uuid FROM jsonb_array_elements(draft) l) ORDER BY p.item_id FOR SHARE OF c,p LOOP
   SELECT l INTO line FROM jsonb_array_elements(draft) l WHERE (l->>'serviceId')::uuid=svc.id;
   total:=total+svc.price_minor::numeric*(line->>'quantity')::integer;
   quoted:=quoted||jsonb_build_array(jsonb_build_object('serviceId',svc.id,'quantity',line->'quantity','name',svc.name,'priceMinor',svc.price_minor::text,'catalogRevision',svc.revision));
  END LOOP;
  IF jsonb_array_length(quoted)<>jsonb_array_length(draft) THEN RAISE EXCEPTION 'SERVICE_UNAVAILABLE' USING ERRCODE='23514';END IF;
  IF total>9223372036854775807 THEN RAISE EXCEPTION 'SERVICE_PRICE_CHANGED' USING ERRCODE='23514';END IF;
  UPDATE public.market_orders SET proposal=jsonb_build_object('status','pending','note',btrim(body->>'note'),'totalMinor',total::text,'lines',quoted,'expiresAt',clock_timestamp()+interval '15 minutes') WHERE order_id=oid;
 ELSIF m.proposal->>'status' IS DISTINCT FROM 'pending' THEN RAISE EXCEPTION 'SERVICE_TRANSITION_INVALID' USING ERRCODE='23514';
 ELSIF action='accept_proposal' THEN
  IF (m.proposal->>'expiresAt')::timestamptz<=clock_timestamp() THEN RAISE EXCEPTION 'SERVICE_TRANSITION_INVALID' USING ERRCODE='23514';END IF;
  IF jsonb_typeof(body->'expectedTotalMinor') IS DISTINCT FROM 'string' OR body->>'expectedTotalMinor' IS DISTINCT FROM m.proposal->>'totalMinor' THEN RAISE EXCEPTION 'SERVICE_PRICE_CHANGED' USING ERRCODE='23514';END IF;
  SELECT jsonb_agg(jsonb_build_object('serviceId',l->'serviceId','quantity',l->'quantity','expectedRevision',l->'catalogRevision')) INTO request_lines FROM jsonb_array_elements(m.proposal->'lines') l;
  UPDATE public.market_orders SET proposal=proposal||jsonb_build_object('status','accepted') WHERE order_id=oid;
  result:=service_private.market_replace(session_hash,oid,gen_random_uuid(),jsonb_build_object('action','replace_order','expectedRevision',m.revision,'expectedTotalMinor',body->'expectedTotalMinor','lines',request_lines));
 ELSE
  UPDATE public.market_orders SET proposal=proposal||jsonb_build_object('status',CASE action WHEN 'decline_proposal' THEN 'declined' ELSE 'withdrawn' END) WHERE order_id=oid;
 END IF;
 IF action<>'accept_proposal' THEN
  UPDATE public.market_orders SET revision=revision+1,updated_at=clock_timestamp() WHERE order_id=oid;
  result:=service_private.market_receipt(oid);
 END IF;
 PERFORM service_private.service_command_record(who,mid,key,payload,result,ord.organization_id,oid,'market.'||action);RETURN result;
END $$;
CREATE OR REPLACE FUNCTION app.market_guest_act(session_hash text,oid uuid,key uuid,body jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF body->>'action' IN ('accept_proposal','decline_proposal') THEN RETURN service_private.market_proposal_act(session_hash,oid,key,body,false);END IF;
 IF body->>'action'='replace_order' THEN RETURN service_private.market_replace(session_hash,oid,key,body);END IF;
 RETURN service_private.market_act(session_hash,oid,key,body,false);
END $$;
CREATE OR REPLACE FUNCTION app.market_staff_act(session_hash text,oid uuid,key uuid,body jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF body->>'action' IN ('propose_replacement','withdraw_proposal') THEN RETURN service_private.market_proposal_act(session_hash,oid,key,body,true);END IF;
 RETURN service_private.market_act(session_hash,oid,key,body,true);
END $$;
REVOKE ALL ON FUNCTION service_private.market_proposal_act(text,uuid,uuid,jsonb,boolean) FROM PUBLIC;
COMMIT;
