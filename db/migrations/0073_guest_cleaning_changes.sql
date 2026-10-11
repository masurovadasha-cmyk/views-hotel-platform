BEGIN;
-- The original requested_for and commercial snapshot stay immutable. The task's
-- scheduled_period is the current plan; both queues read it after this migration.
CREATE FUNCTION app.guest_cleaning_change(session_hash text,oid uuid,command_key uuid,body jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid:=service_private.guest_user(session_hash); ord public.service_orders;
 task public.service_cleaning_tasks; stay public.reservations; action text:=body->>'action';
 payload jsonb:=jsonb_build_object('kind','guest_change','orderId',oid,'body',body);
 prior jsonb; result jsonb; requested timestamptz; duration interval;
BEGIN
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR action IS NULL OR action NOT IN ('cancel','reschedule')
 OR jsonb_typeof(body->'expectedRevision') IS DISTINCT FROM 'number' OR (body->>'expectedRevision')::integer<1
 OR (action='cancel' AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM ARRAY['action','expectedRevision'])
 OR (action='reschedule' AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM ARRAY['action','expectedRevision','requestedFor'])
 THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 SELECT o.* INTO ord FROM public.service_orders o
 JOIN public.reservations r ON r.id=o.reservation_id AND r.organization_id=o.organization_id AND r.property_id=o.property_id
 JOIN public.guest_profiles g ON g.id=r.primary_guest_id AND g.organization_id=r.organization_id
 JOIN public.service_cleaning_tasks t ON t.order_id=o.id
 WHERE o.id=oid AND g.user_id=who;
 IF ord.id IS NULL THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 prior:=service_private.service_command_replay(who,command_key,payload);
 IF prior IS NOT NULL THEN RETURN prior; END IF;
 -- Same lock order as staff execution and checkout. Recheck ownership/session
 -- after waiting so reassignment of a guest profile cannot authorize a write.
 SELECT r.* INTO stay FROM public.reservations r
 JOIN public.guest_profiles g ON g.id=r.primary_guest_id AND g.organization_id=r.organization_id
 WHERE r.id=ord.reservation_id AND g.user_id=who FOR UPDATE OF r FOR SHARE OF g;
 IF stay.id IS NULL THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT * INTO ord FROM public.service_orders WHERE id=oid FOR UPDATE;
 SELECT * INTO task FROM public.service_cleaning_tasks WHERE order_id=oid FOR UPDATE;
 PERFORM service_private.guest_user(session_hash);
 IF task.revision IS DISTINCT FROM (body->>'expectedRevision')::integer THEN RAISE EXCEPTION 'SERVICE_REVISION_CHANGED' USING ERRCODE='23514'; END IF;
 IF task.stage NOT IN ('requested','assigned') OR ord.status NOT IN ('requested','accepted')
 OR task.folio_entry_id IS NOT NULL THEN RAISE EXCEPTION 'SERVICE_TRANSITION_INVALID' USING ERRCODE='23514'; END IF;
 IF action='cancel' THEN
  UPDATE public.service_cleaning_tasks SET stage='cancelled' WHERE order_id=oid;
  UPDATE public.service_orders SET status='cancelled' WHERE id=oid;
 ELSE
  IF stay.status<>'checked_in' OR stay.unit_id::text IS DISTINCT FROM ord.snapshot->>'unitId' THEN RAISE EXCEPTION 'SERVICE_STAY_CHANGED' USING ERRCODE='23514'; END IF;
  IF jsonb_typeof(body->'requestedFor') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023'; END IF;
  requested:=(body->>'requestedFor')::timestamptz;
  duration:=upper(task.scheduled_period)-lower(task.scheduled_period);
  IF requested IS NULL OR NOT isfinite(requested) OR requested<clock_timestamp() OR requested<stay.check_in_at OR requested+duration>stay.check_out_at THEN RAISE EXCEPTION 'SERVICE_TIME_INVALID' USING ERRCODE='23514'; END IF;
  -- Existing GiST exclusion enforces worker capacity atomically; on conflict
  -- the entire command, receipt, audit and outbox roll back.
  UPDATE public.service_cleaning_tasks SET scheduled_period=tstzrange(requested,requested+duration,'[)') WHERE order_id=oid;
 END IF;
 UPDATE public.service_cleaning_tasks SET revision=revision+1,updated_at=clock_timestamp() WHERE order_id=oid RETURNING * INTO task;
 SELECT * INTO ord FROM public.service_orders WHERE id=oid;
 result:=jsonb_build_object('orderId',oid,'status',ord.status,'stage',task.stage,'revision',task.revision,
  'requestedFor',lower(task.scheduled_period),'currency',ord.currency,'totalMinor',ord.total_minor::text,
  'idempotentReplay',false);
 PERFORM service_private.service_command_record(who,NULL,command_key,payload,result,ord.organization_id,oid,'service.guest_'||action);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION app.guest_cleaning_change(text,uuid,uuid,jsonb) FROM PUBLIC;
CREATE OR REPLACE FUNCTION app.guest_cleaning_orders(session_hash text,reservation uuid,after_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid:=service_private.guest_user(session_hash); rows jsonb;
BEGIN
 PERFORM 1 FROM public.reservations r JOIN public.guest_profiles g ON g.id=r.primary_guest_id AND g.organization_id=r.organization_id WHERE r.id=reservation AND g.user_id=who;
 IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('orderId',o.id,'name',o.snapshot->'name','status',o.status,'stage',o.stage,'revision',o.revision,'requestedFor',o.current_requested_for,'currency',o.currency,'totalMinor',o.total_minor::text) ORDER BY o.id),'[]') INTO rows
 FROM (SELECT o.*,t.stage,t.revision,lower(t.scheduled_period) AS current_requested_for FROM public.service_orders o JOIN public.service_cleaning_tasks t ON t.order_id=o.id
 JOIN public.reservations r ON r.id=o.reservation_id AND r.organization_id=o.organization_id AND r.property_id=o.property_id
 JOIN public.guest_profiles g ON g.id=r.primary_guest_id AND g.organization_id=r.organization_id
 WHERE r.id=reservation AND g.user_id=who AND (after_id IS NULL OR o.id>after_id) ORDER BY o.id LIMIT 51) o;
 RETURN jsonb_build_object('items',rows,'pageSize',50);
END $$;
CREATE OR REPLACE FUNCTION app.staff_cleaning_queue(session_hash text,property uuid,after_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid:=service_private.staff_user(session_hash); org uuid:=app.current_organization_id(); rows jsonb; manager boolean;
BEGIN
 manager:=app.registry_access(org,property,'reservation.manage');
 IF NOT manager AND NOT app.registry_access(org,property,'housekeeping.work') THEN RAISE EXCEPTION 'SERVICE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('orderId',o.id,'reservationId',o.reservation_id,'unitId',o.snapshot->'unitId','unitCode',(SELECT u.code FROM public.units u WHERE u.id::text=o.snapshot->>'unitId' AND u.property_id=o.property_id),'name',o.snapshot->'name','status',o.status,'stage',o.stage,'revision',o.revision,'assignedMembershipId',o.assigned_membership_id,'requestedFor',o.current_requested_for,'currency',o.currency,'totalMinor',o.total_minor::text,'checklist',o.checklist,'completionNote',o.completion_note,'inspectionNote',o.inspection_note) ORDER BY o.id),'[]') INTO rows
 FROM (SELECT o.*,lower(t.scheduled_period) AS current_requested_for,t.stage,t.revision,t.assigned_membership_id,t.checklist,t.completion_note,t.inspection_note FROM public.service_orders o JOIN public.service_cleaning_tasks t ON t.order_id=o.id
 WHERE o.organization_id=org AND o.property_id=property AND (manager OR t.assigned_membership_id=app.current_membership_id()) AND (after_id IS NULL OR o.id>after_id) ORDER BY o.id LIMIT 51) o;
 RETURN jsonb_build_object('items',rows,'pageSize',50);
END $$;
COMMIT;
