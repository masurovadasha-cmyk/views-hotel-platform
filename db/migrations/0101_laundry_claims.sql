BEGIN;
ALTER TABLE public.laundry_intakes ADD COLUMN claim jsonb;
ALTER FUNCTION service_private.laundry_act(text,uuid,uuid,jsonb,boolean) RENAME TO laundry_fulfilment_act;
CREATE FUNCTION service_private.laundry_act(session_hash text,iid uuid,key uuid,body jsonb,staff boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid;mid uuid;i public.laundry_intakes;stay public.reservations;action text:=body->>'action';payload jsonb;prior jsonb;event jsonb;
BEGIN
 IF action IS NULL OR action NOT IN ('report_claim','answer_claim','resolve_claim','confirm_receipt') THEN RETURN service_private.laundry_fulfilment_act(session_hash,iid,key,body,staff);END IF;
 IF staff THEN who:=service_private.staff_user(session_hash);mid:=app.current_membership_id();ELSE who:=service_private.guest_user(session_hash);END IF;
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR jsonb_typeof(body->'expectedRevision') IS DISTINCT FROM 'number' OR body->>'expectedRevision' !~ '^[1-9][0-9]*$' THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023';END IF;
 IF action='report_claim' THEN
  IF (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM ARRAY['action','expectedRevision','kind','note','tag'] OR body->>'kind' NOT IN ('missing','damaged','quality') OR jsonb_typeof(body->'kind') IS DISTINCT FROM 'string' OR jsonb_typeof(body->'tag') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023';END IF;
 ELSIF action='answer_claim' THEN
  IF (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM ARRAY['action','expectedRevision','note'] THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023';END IF;
 ELSE
  IF (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM ARRAY['action','expectedRevision'] THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023';END IF;
 END IF;
 IF action IN ('report_claim','answer_claim') AND (jsonb_typeof(body->'note') IS DISTINCT FROM 'string' OR length(btrim(body->>'note')) NOT BETWEEN 3 AND 500 OR body->>'note' ~ '[[:cntrl:]]') THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023';END IF;
 SELECT * INTO i FROM public.laundry_intakes WHERE id=iid;
 IF i.id IS NULL THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002';END IF;
 -- Lock in the same order as fulfilment; re-check ownership after the locks, before replay.
 PERFORM pg_advisory_xact_lock(hashtextextended('service:'||who||':'||key,0));
 SELECT * INTO stay FROM public.reservations WHERE id=i.reservation_id FOR UPDATE;
 SELECT * INTO i FROM public.laundry_intakes WHERE id=iid FOR UPDATE;
 IF staff THEN
  PERFORM service_private.staff_user(session_hash);
  IF NOT app.registry_access(i.organization_id,i.property_id,'reservation.manage') THEN RAISE EXCEPTION 'SERVICE_FORBIDDEN' USING ERRCODE='42501';END IF;
 ELSE
  PERFORM service_private.guest_user(session_hash);
  PERFORM 1 FROM public.guest_profiles WHERE id=stay.primary_guest_id AND organization_id=stay.organization_id AND user_id=who FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002';END IF;
 END IF;
 payload:=jsonb_build_object('kind','laundry_action','staff',staff,'membershipId',mid,'intakeId',iid,'body',body);
 prior:=service_private.service_command_replay(who,key,payload);IF prior IS NOT NULL THEN RETURN prior;END IF;
 IF i.revision IS DISTINCT FROM (body->>'expectedRevision')::integer THEN RAISE EXCEPTION 'SERVICE_REVISION_CHANGED' USING ERRCODE='23514';END IF;
 IF action='confirm_receipt' THEN
  IF i.claim IS NOT NULL AND i.claim->>'status'<>'resolved' THEN RAISE EXCEPTION 'SERVICE_TRANSITION_INVALID' USING ERRCODE='23514';END IF;
  RETURN service_private.laundry_fulfilment_act(session_hash,iid,key,body,staff);
 END IF;
 IF action IN ('report_claim','answer_claim') AND coalesce(jsonb_array_length(i.claim->'history'),0)>=8 THEN RAISE EXCEPTION 'SERVICE_TRANSITION_INVALID' USING ERRCODE='23514';END IF;
 event:=jsonb_build_object('action',action,'at',clock_timestamp(),'note',coalesce(btrim(body->>'note'),''));
 IF NOT staff AND action='report_claim' AND i.stage IN ('accepted','washing','ready','delivered','closed') AND coalesce(i.claim->>'status','')<>'open' THEN
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(i.items) x WHERE x->>'tag'=body->>'tag') THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023';END IF;
  event:=event||jsonb_build_object('tag',body->>'tag','kind',body->>'kind');
  i.claim:=jsonb_build_object('status','open','tag',body->>'tag','kind',body->>'kind','history',coalesce(i.claim->'history','[]')||jsonb_build_array(event));
 ELSIF staff AND action='answer_claim' AND i.claim->>'status'='open' THEN
  i.claim:=i.claim||jsonb_build_object('status','answered','history',(i.claim->'history')||jsonb_build_array(event));
 ELSIF NOT staff AND action='resolve_claim' AND i.claim->>'status' IN ('open','answered') THEN
  i.claim:=i.claim||jsonb_build_object('status','resolved','history',(i.claim->'history')||jsonb_build_array(event));
 ELSE RAISE EXCEPTION 'SERVICE_TRANSITION_INVALID' USING ERRCODE='23514';END IF;
 UPDATE public.laundry_intakes SET claim=i.claim,revision=revision+1,updated_at=clock_timestamp() WHERE id=iid RETURNING * INTO i;
 RETURN service_private.laundry_record(who,mid,key,payload,i,'laundry.'||action);
END $$;
CREATE OR REPLACE FUNCTION app.laundry_guest_act(session_hash text,iid uuid,key uuid,body jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT service_private.laundry_act(session_hash,iid,key,body,false) $$;
CREATE OR REPLACE FUNCTION app.laundry_staff_act(session_hash text,iid uuid,key uuid,body jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT service_private.laundry_act(session_hash,iid,key,body,true) $$;
CREATE OR REPLACE FUNCTION service_private.laundry_receipt(i public.laundry_intakes) RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('intakeId',i.id,'stage',i.stage,'revision',i.revision,'name',i.name,'currency',i.currency,
 'declaredCount',i.declared_count,'preferences',i.preferences,'pickupAt',i.pickup_at,'estimateMinor',i.estimate_minor::text,
 'items',i.items,'totalMinor',i.total_minor::text,'returnBy',i.return_by,'orderId',i.order_id,'idempotentReplay',false,'claim',i.claim)
$$;
CREATE OR REPLACE FUNCTION app.laundry_guest_list(session_hash text,reservation uuid,after_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid:=service_private.guest_user(session_hash); result jsonb;
BEGIN
 PERFORM 1 FROM public.reservations r JOIN public.guest_profiles g ON g.id=r.primary_guest_id AND g.organization_id=r.organization_id WHERE r.id=reservation AND g.user_id=who;
 IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT coalesce(jsonb_agg(service_private.laundry_receipt(i) ORDER BY i.id),'[]') INTO result FROM (SELECT * FROM public.laundry_intakes WHERE reservation_id=reservation AND (after_id IS NULL OR id>after_id) ORDER BY id LIMIT 3) i;
 RETURN jsonb_build_object('items',result);
END $$;
CREATE OR REPLACE FUNCTION app.laundry_staff_list(session_hash text,property uuid,after_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid:=service_private.staff_user(session_hash); result jsonb;
BEGIN
 IF NOT app.registry_access(app.current_organization_id(),property,'reservation.manage') THEN RAISE EXCEPTION 'SERVICE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg((service_private.laundry_receipt(i) || jsonb_build_object('unitCode',(SELECT u.code FROM public.reservations r JOIN public.units u ON u.id=r.unit_id AND u.property_id=r.property_id WHERE r.id=i.reservation_id AND r.organization_id=i.organization_id AND r.property_id=i.property_id))) ORDER BY i.id),'[]') INTO result FROM (SELECT * FROM public.laundry_intakes WHERE organization_id=app.current_organization_id() AND property_id=property AND (after_id IS NULL OR id>after_id) ORDER BY id LIMIT 3) i;
 RETURN jsonb_build_object('items',result);
END $$;
REVOKE ALL ON FUNCTION service_private.laundry_act(text,uuid,uuid,jsonb,boolean),service_private.laundry_fulfilment_act(text,uuid,uuid,jsonb,boolean) FROM PUBLIC;
COMMIT;
