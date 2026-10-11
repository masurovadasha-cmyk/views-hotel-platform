BEGIN;
CREATE FUNCTION app.concierge_staff_list(session_hash text,property uuid,after_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid:=service_private.staff_user(session_hash);rows jsonb;manager boolean:=app.registry_access(app.current_organization_id(),property,'reservation.manage');
BEGIN
 IF NOT manager AND NOT app.registry_access(app.current_organization_id(),property,'concierge.work') THEN RAISE EXCEPTION 'SERVICE_FORBIDDEN' USING ERRCODE='42501';END IF;
 SELECT coalesce(jsonb_agg(service_private.concierge_receipt(q.order_id)||jsonb_build_object('unitCode',q.code,'mine',q.assigned_membership_id=app.current_membership_id()) ORDER BY q.order_id),'[]') INTO rows
 FROM (SELECT c.order_id,c.assigned_membership_id,u.code FROM public.concierge_requests c JOIN public.service_orders o ON o.id=c.order_id JOIN public.reservations r ON r.id=o.reservation_id LEFT JOIN public.units u ON u.id=r.unit_id AND u.property_id=r.property_id
 WHERE c.organization_id=app.current_organization_id() AND c.property_id=property AND (manager OR c.assigned_membership_id IS NULL OR c.assigned_membership_id=app.current_membership_id()) AND (after_id IS NULL OR c.order_id>after_id) ORDER BY c.order_id LIMIT 51) q;
 RETURN jsonb_build_object('items',rows);
END $$;
CREATE FUNCTION service_private.concierge_act(session_hash text,oid uuid,key uuid,body jsonb,staff boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid;mid uuid;ord public.service_orders;r public.concierge_requests;manager boolean:=false;result jsonb;prior jsonb;action text:=body->>'action';keys text[];
 payload jsonb:=jsonb_build_object('kind','concierge_action','orderId',oid,'staff',staff,'body',body);
BEGIN
 IF staff THEN who:=service_private.staff_user(session_hash);mid:=app.current_membership_id();payload:=payload||jsonb_build_object('membershipId',mid);ELSE who:=service_private.guest_user(session_hash);END IF;
 keys:=CASE WHEN action IN ('message','answer') THEN ARRAY['action','expectedRevision','message'] WHEN action IN ('claim','release','close','cancel') THEN ARRAY['action','expectedRevision'] END;
 IF keys IS NULL OR jsonb_typeof(body) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM keys OR jsonb_typeof(body->'expectedRevision') IS DISTINCT FROM 'number' OR body->>'expectedRevision' !~ '^[1-9][0-9]*$'
 OR (action IN ('message','answer') AND (jsonb_typeof(body->'message') IS DISTINCT FROM 'string' OR length(btrim(body->>'message')) NOT BETWEEN 1 AND 500 OR body->>'message' ~ '[[:cntrl:]]')) THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023';END IF;
 SELECT o.* INTO ord FROM public.service_orders o JOIN public.concierge_requests c ON c.order_id=o.id WHERE o.id=oid;
 IF ord.id IS NULL THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002';END IF;
 IF staff THEN
  manager:=app.registry_access(ord.organization_id,ord.property_id,'reservation.manage');
  IF NOT manager AND NOT app.registry_access(ord.organization_id,ord.property_id,'concierge.work') THEN RAISE EXCEPTION 'SERVICE_FORBIDDEN' USING ERRCODE='42501';END IF;
 ELSE
  PERFORM 1 FROM public.reservations s JOIN public.guest_profiles g ON g.id=s.primary_guest_id AND g.organization_id=s.organization_id WHERE s.id=ord.reservation_id AND g.user_id=who;
  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002';END IF;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('service:'||who||':'||key,0));
 -- Serialize ownership with guest-link changes before replay or mutation.
 PERFORM 1 FROM public.reservations WHERE id=ord.reservation_id FOR UPDATE;
 IF staff THEN
  PERFORM service_private.staff_user(session_hash);
  manager:=app.registry_access(ord.organization_id,ord.property_id,'reservation.manage');
  IF NOT manager AND NOT app.registry_access(ord.organization_id,ord.property_id,'concierge.work') THEN RAISE EXCEPTION 'SERVICE_FORBIDDEN' USING ERRCODE='42501';END IF;
 ELSE
  PERFORM service_private.guest_user(session_hash);
  PERFORM 1 FROM public.reservations s JOIN public.guest_profiles g ON g.id=s.primary_guest_id AND g.organization_id=s.organization_id WHERE s.id=ord.reservation_id AND g.user_id=who FOR SHARE OF g;
  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002';END IF;
 END IF;
 SELECT * INTO r FROM public.concierge_requests WHERE order_id=oid FOR UPDATE;
 IF staff AND NOT manager AND r.assigned_membership_id IS NOT NULL AND r.assigned_membership_id<>mid THEN RAISE EXCEPTION 'SERVICE_FORBIDDEN' USING ERRCODE='42501';END IF;
 prior:=service_private.service_command_replay(who,key,payload);IF prior IS NOT NULL THEN RETURN prior;END IF;
 IF r.revision IS DISTINCT FROM (body->>'expectedRevision')::integer THEN RAISE EXCEPTION 'SERVICE_REVISION_CHANGED' USING ERRCODE='23514';END IF;
 IF r.stage IN ('closed','cancelled') THEN RAISE EXCEPTION 'SERVICE_TRANSITION_INVALID' USING ERRCODE='23514';END IF;
 IF action='claim' AND staff AND r.stage='requested' AND r.assigned_membership_id IS NULL THEN
  UPDATE public.concierge_requests SET assigned_membership_id=mid,stage='working' WHERE order_id=oid;
 ELSIF action='release' AND staff AND r.stage='working' AND (manager OR r.assigned_membership_id=mid) THEN
  UPDATE public.concierge_requests SET assigned_membership_id=NULL,stage='requested' WHERE order_id=oid;
 ELSIF action IN ('message','answer') AND (NOT staff AND action='message' OR staff AND r.assigned_membership_id=mid AND r.stage IN ('working','answered')) THEN
  IF (SELECT count(*) FROM public.concierge_messages WHERE order_id=oid)>=100 THEN RAISE EXCEPTION 'SERVICE_MESSAGE_LIMIT' USING ERRCODE='23514';END IF;
  INSERT INTO public.concierge_messages(organization_id,property_id,order_id,author_kind,body) VALUES(ord.organization_id,ord.property_id,oid,CASE WHEN staff THEN 'staff' ELSE 'guest' END,btrim(body->>'message'));
  UPDATE public.concierge_requests SET stage=CASE WHEN action='answer' THEN 'answered' WHEN NOT staff AND stage='answered' THEN 'working' ELSE stage END,
   answered_at=CASE WHEN action='answer' THEN clock_timestamp() WHEN NOT staff AND stage='answered' THEN NULL ELSE answered_at END,
   response_due_at=CASE WHEN NOT staff AND stage='answered' THEN clock_timestamp()+interval '15 minutes' ELSE response_due_at END WHERE order_id=oid;
 ELSIF action='close' AND NOT staff AND r.stage='answered' THEN UPDATE public.concierge_requests SET stage='closed' WHERE order_id=oid;
 ELSIF action='cancel' AND NOT staff AND r.stage IN ('requested','working','answered') THEN UPDATE public.concierge_requests SET stage='cancelled' WHERE order_id=oid;
 ELSE RAISE EXCEPTION 'SERVICE_TRANSITION_INVALID' USING ERRCODE='23514';END IF;
 UPDATE public.concierge_requests SET revision=revision+1 WHERE order_id=oid RETURNING * INTO r;
 IF action='claim' AND ord.status='requested' THEN UPDATE public.service_orders SET status='accepted' WHERE id=oid;
 ELSIF action='close' THEN
  UPDATE public.service_orders SET status='in_progress' WHERE id=oid;
  UPDATE public.service_orders SET status='completed' WHERE id=oid;
 ELSIF action='cancel' THEN UPDATE public.service_orders SET status='cancelled' WHERE id=oid;
 END IF;
 result:=service_private.concierge_receipt(oid);PERFORM service_private.service_command_record(who,mid,key,payload,result,ord.organization_id,oid,'concierge.'||action);RETURN result;
END $$;
CREATE FUNCTION app.concierge_guest_act(session_hash text,oid uuid,key uuid,body jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT service_private.concierge_act(session_hash,oid,key,body,false) $$;
CREATE FUNCTION app.concierge_staff_act(session_hash text,oid uuid,key uuid,body jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT service_private.concierge_act(session_hash,oid,key,body,true) $$;
REVOKE ALL ON FUNCTION app.concierge_staff_list(text,uuid,uuid),app.concierge_guest_act(text,uuid,uuid,jsonb),app.concierge_staff_act(text,uuid,uuid,jsonb),service_private.concierge_act(text,uuid,uuid,jsonb,boolean) FROM PUBLIC;
COMMIT;
