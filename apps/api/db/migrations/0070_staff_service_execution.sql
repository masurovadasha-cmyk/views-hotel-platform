BEGIN;
CREATE FUNCTION app.staff_cleaning_queue(session_hash text,property uuid,after_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid:=service_private.staff_user(session_hash); org uuid:=app.current_organization_id(); rows jsonb; manager boolean;
BEGIN
 manager:=app.registry_access(org,property,'reservation.manage');
 IF NOT manager AND NOT app.registry_access(org,property,'housekeeping.work') THEN RAISE EXCEPTION 'SERVICE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('orderId',o.id,'reservationId',o.reservation_id,'unitId',o.snapshot->'unitId','name',o.snapshot->'name','status',o.status,'stage',o.stage,'revision',o.revision,'assignedMembershipId',o.assigned_membership_id,'requestedFor',o.requested_for,'currency',o.currency,'totalMinor',o.total_minor::text,'checklist',o.checklist,'completionNote',o.completion_note,'inspectionNote',o.inspection_note) ORDER BY o.id),'[]') INTO rows
 FROM (SELECT o.*,t.stage,t.revision,t.assigned_membership_id,t.checklist,t.completion_note,t.inspection_note FROM public.service_orders o JOIN public.service_cleaning_tasks t ON t.order_id=o.id
 WHERE o.organization_id=org AND o.property_id=property AND (manager OR t.assigned_membership_id=app.current_membership_id()) AND (after_id IS NULL OR o.id>after_id) ORDER BY o.id LIMIT 51) o;
 RETURN jsonb_build_object('items',rows,'pageSize',50);
END $$;
CREATE FUNCTION app.staff_cleaning_act(session_hash text,oid uuid,command_key uuid,body jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid:=service_private.staff_user(session_hash); mid uuid:=app.current_membership_id();
 ord public.service_orders; task public.service_cleaning_tasks; stay public.reservations; folio public.guest_folios;
 payload jsonb:=jsonb_build_object('kind','staff_action','membershipId',mid,'orderId',oid,'body',body); prior jsonb; result jsonb;
 action text:=body->>'action'; manager boolean; target uuid; worker_user uuid; entry uuid;
BEGIN
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR action IS NULL OR (body->>'expectedRevision') IS NULL OR NOT body ?& ARRAY['action','expectedRevision'] OR (body->>'expectedRevision')::integer<1 OR action NOT IN ('assign','start','submit','approve','reject','cancel') THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 IF (action='assign' AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM ARRAY['action','assigneeId','expectedRevision']) OR
 (action='start' AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM ARRAY['action','expectedRevision']) OR
 (action='submit' AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM ARRAY['action','checklist','expectedRevision','note']) OR
 (action IN ('approve','reject','cancel') AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM ARRAY['action','expectedRevision','note'])
 THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 SELECT * INTO ord FROM public.service_orders WHERE id=oid AND organization_id=app.current_organization_id();
 SELECT * INTO task FROM public.service_cleaning_tasks WHERE order_id=oid;
 manager:=app.registry_access(ord.organization_id,ord.property_id,'reservation.manage');
 IF ord.id IS NULL OR task.order_id IS NULL OR NOT coalesce(manager OR task.assigned_membership_id=mid AND app.registry_access(ord.organization_id,ord.property_id,'housekeeping.work'),false) THEN RAISE EXCEPTION 'SERVICE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 prior:=service_private.service_command_replay(who,command_key,payload);IF prior IS NOT NULL THEN RETURN prior; END IF;
 -- Same ordering as folio/checkout: reservation, order/task, folio. Auth is rechecked after waits.
 SELECT * INTO stay FROM public.reservations WHERE id=ord.reservation_id AND organization_id=ord.organization_id FOR UPDATE;
 SELECT * INTO ord FROM public.service_orders WHERE id=oid FOR UPDATE;
 SELECT * INTO task FROM public.service_cleaning_tasks WHERE order_id=oid FOR UPDATE;
 PERFORM service_private.staff_user(session_hash);
 manager:=app.registry_access(ord.organization_id,ord.property_id,'reservation.manage');
 IF task.revision IS DISTINCT FROM (body->>'expectedRevision')::integer THEN RAISE EXCEPTION 'SERVICE_REVISION_CHANGED' USING ERRCODE='23514'; END IF;
 IF action IN ('assign','approve','reject','cancel') THEN
  IF NOT coalesce(manager,false) THEN RAISE EXCEPTION 'SERVICE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 ELSE
  IF task.assigned_membership_id IS DISTINCT FROM mid OR NOT app.registry_access(ord.organization_id,ord.property_id,'housekeeping.work') THEN RAISE EXCEPTION 'SERVICE_NOT_ASSIGNED' USING ERRCODE='42501'; END IF;
 END IF;
 IF action IN ('submit','approve','reject','cancel') AND (jsonb_typeof(body->'note') IS DISTINCT FROM 'string' OR length(btrim(body->>'note')) NOT BETWEEN 1 AND 500) THEN RAISE EXCEPTION 'SERVICE_NOTE_REQUIRED' USING ERRCODE='22023'; END IF;
 IF action IN ('assign','start') AND (stay.status<>'checked_in' OR stay.unit_id::text IS DISTINCT FROM ord.snapshot->>'unitId') THEN RAISE EXCEPTION 'SERVICE_STAY_CHANGED' USING ERRCODE='23514'; END IF;
 IF action='assign' THEN
  IF task.stage NOT IN ('requested','assigned') THEN RAISE EXCEPTION 'SERVICE_TRANSITION_INVALID' USING ERRCODE='23514'; END IF;
  target:=(body->>'assigneeId')::uuid;
  PERFORM 1 FROM public.organization_memberships m JOIN public.users u ON u.id=m.user_id AND u.status='active'
   JOIN public.roles r ON r.id=m.role_id AND r.code='housekeeper' JOIN public.role_permissions rp ON rp.role_id=r.id
   JOIN public.permissions p ON p.id=rp.permission_id AND p.code='housekeeping.work'
   JOIN public.membership_property_scopes s ON s.membership_id=m.id AND s.property_id=ord.property_id
   WHERE m.id=target AND m.organization_id=ord.organization_id AND m.status='active' FOR SHARE OF m,u,s;
  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_ASSIGNEE_INVALID' USING ERRCODE='23514'; END IF;
  IF task.stage='requested' THEN UPDATE public.service_orders SET status='accepted' WHERE id=oid; END IF;
  UPDATE public.service_cleaning_tasks SET stage='assigned',assigned_membership_id=target WHERE order_id=oid;
 ELSIF action='start' THEN
  IF task.stage NOT IN ('assigned','rework') THEN RAISE EXCEPTION 'SERVICE_TRANSITION_INVALID' USING ERRCODE='23514'; END IF;
  IF ord.status='accepted' THEN UPDATE public.service_orders SET status='in_progress' WHERE id=oid; END IF;
  UPDATE public.service_cleaning_tasks SET stage='working' WHERE order_id=oid;
 ELSIF action='submit' THEN
  IF task.stage<>'working' THEN RAISE EXCEPTION 'SERVICE_TRANSITION_INVALID' USING ERRCODE='23514'; END IF;
  IF body->'checklist' IS DISTINCT FROM '{"linen":true,"bathroom":true,"floor":true}'::jsonb THEN RAISE EXCEPTION 'SERVICE_CHECKLIST_INCOMPLETE' USING ERRCODE='23514'; END IF;
  UPDATE public.service_cleaning_tasks SET stage='inspection',checklist=body->'checklist',completion_note=btrim(body->>'note') WHERE order_id=oid;
 ELSIF action IN ('approve','reject') THEN
  IF task.stage<>'inspection' THEN RAISE EXCEPTION 'SERVICE_TRANSITION_INVALID' USING ERRCODE='23514'; END IF;
  SELECT user_id INTO worker_user FROM public.organization_memberships WHERE id=task.assigned_membership_id;
  IF worker_user=who THEN RAISE EXCEPTION 'SERVICE_SELF_INSPECTION_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF action='reject' THEN UPDATE public.service_cleaning_tasks SET stage='rework',inspection_note=btrim(body->>'note') WHERE order_id=oid;
  ELSE
   IF stay.status NOT IN ('checked_in','checked_out') OR stay.currency<>ord.currency THEN RAISE EXCEPTION 'SERVICE_STAY_INELIGIBLE' USING ERRCODE='23514'; END IF;
   SELECT * INTO folio FROM public.guest_folios WHERE organization_id=ord.organization_id AND reservation_id=ord.reservation_id FOR UPDATE;
   IF folio.id IS NULL THEN INSERT INTO public.guest_folios(organization_id,property_id,reservation_id,currency) VALUES(ord.organization_id,ord.property_id,ord.reservation_id,ord.currency) RETURNING * INTO folio;
   ELSIF folio.status<>'open' THEN RAISE EXCEPTION 'FOLIO_NOT_OPEN' USING ERRCODE='23514'; END IF;
   entry:=gen_random_uuid();
   INSERT INTO public.folio_entries(id,organization_id,property_id,folio_id,currency,kind,amount_minor,label,source_type,source_id,idempotency_key,policy_snapshot)
   VALUES(entry,ord.organization_id,ord.property_id,folio.id,ord.currency,'service',ord.total_minor,ord.snapshot->'name','service_order',oid,'service-order:'||oid,ord.snapshot);
   UPDATE public.service_cleaning_tasks SET stage='done',inspection_note=btrim(body->>'note'),inspected_by=who,folio_entry_id=entry WHERE order_id=oid;
   UPDATE public.service_orders SET status='completed' WHERE id=oid;
  END IF;
 ELSIF action='cancel' THEN
  IF task.stage NOT IN ('requested','assigned') THEN RAISE EXCEPTION 'SERVICE_TRANSITION_INVALID' USING ERRCODE='23514'; END IF;
  UPDATE public.service_cleaning_tasks SET stage='cancelled',inspection_note=btrim(body->>'note') WHERE order_id=oid;
  UPDATE public.service_orders SET status='cancelled' WHERE id=oid;
 END IF;
 UPDATE public.service_cleaning_tasks SET revision=revision+1,updated_at=clock_timestamp() WHERE order_id=oid RETURNING * INTO task;
 SELECT * INTO ord FROM public.service_orders WHERE id=oid;
 result:=jsonb_build_object('orderId',oid,'status',ord.status,'stage',task.stage,'revision',task.revision,'folioEntryId',task.folio_entry_id,'idempotentReplay',false);
 PERFORM service_private.service_command_record(who,mid,command_key,payload,result,ord.organization_id,oid,'service.'||action);RETURN result;
END $$;
REVOKE ALL ON FUNCTION app.staff_cleaning_queue(text,uuid,uuid),app.staff_cleaning_act(text,uuid,uuid,jsonb) FROM PUBLIC;
COMMIT;
