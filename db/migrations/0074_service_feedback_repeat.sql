BEGIN;
-- Private service-quality feedback, distinct from public bilateral stay reviews.
CREATE TABLE service_order_feedback (
 order_id uuid PRIMARY KEY,
 organization_id uuid NOT NULL, property_id uuid NOT NULL,
 author_user_id uuid NOT NULL REFERENCES users(id),
 rating smallint NOT NULL CHECK(rating BETWEEN 1 AND 5),
 comment text NOT NULL CHECK(length(comment)<=500 AND comment !~ '[[:cntrl:]]'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(organization_id,property_id,order_id) REFERENCES service_orders(organization_id,property_id,id)
);
CREATE INDEX service_feedback_property_idx ON service_order_feedback(organization_id,property_id,created_at,order_id);
ALTER TABLE service_order_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_order_feedback FORCE ROW LEVEL SECURITY;
CREATE POLICY service_feedback_read ON service_order_feedback FOR SELECT USING(app.registry_access(organization_id,property_id,'reservation.manage'));
-- No runtime INSERT/UPDATE/DELETE policy. One immutable submission per order.
CREATE FUNCTION app.guest_service_feedback(session_hash text,oid uuid,command_key uuid,body jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid:=service_private.guest_user(session_hash); ord public.service_orders; task public.service_cleaning_tasks;
 payload jsonb:=jsonb_build_object('kind','guest_feedback','orderId',oid,'body',body); prior jsonb; result jsonb;
BEGIN
 IF jsonb_typeof(body) IS DISTINCT FROM 'object'
 OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM ARRAY['comment','rating']
 OR jsonb_typeof(body->'rating') IS DISTINCT FROM 'number' OR (body->>'rating') !~ '^[1-5]$'
 OR jsonb_typeof(body->'comment') IS DISTINCT FROM 'string' OR length(body->>'comment')>500 OR body->>'comment' ~ '[[:cntrl:]]'
 THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 SELECT o.* INTO ord FROM public.service_orders o
 JOIN public.reservations r ON r.id=o.reservation_id AND r.organization_id=o.organization_id AND r.property_id=o.property_id
 JOIN public.guest_profiles g ON g.id=r.primary_guest_id AND g.organization_id=r.organization_id
 WHERE o.id=oid AND g.user_id=who;
 IF ord.id IS NULL THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 prior:=service_private.service_command_replay(who,command_key,payload);IF prior IS NOT NULL THEN RETURN prior; END IF;
 PERFORM 1 FROM public.reservations r JOIN public.guest_profiles g ON g.id=r.primary_guest_id AND g.organization_id=r.organization_id
 WHERE r.id=ord.reservation_id AND g.user_id=who FOR UPDATE OF r FOR SHARE OF g;
 IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT * INTO ord FROM public.service_orders WHERE id=oid FOR UPDATE;
 SELECT * INTO task FROM public.service_cleaning_tasks WHERE order_id=oid FOR UPDATE;
 PERFORM service_private.guest_user(session_hash);
 IF ord.status<>'completed' OR task.order_id IS NULL OR task.stage<>'done' OR task.folio_entry_id IS NULL THEN RAISE EXCEPTION 'SERVICE_FEEDBACK_NOT_READY' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM public.service_order_feedback WHERE order_id=oid) THEN RAISE EXCEPTION 'SERVICE_FEEDBACK_EXISTS' USING ERRCODE='23514'; END IF;
 INSERT INTO public.service_order_feedback(order_id,organization_id,property_id,author_user_id,rating,comment)
 VALUES(oid,ord.organization_id,ord.property_id,who,(body->>'rating')::smallint,btrim(body->>'comment'));
 result:=jsonb_build_object('orderId',oid,'revision',task.revision,'rating',(body->>'rating')::integer,'idempotentReplay',false);
 PERFORM service_private.service_command_record(who,NULL,command_key,payload,result,ord.organization_id,oid,'service.feedback_submitted');RETURN result;
END $$;
-- Repeat is a fresh quote lookup, never a write or reuse of an old price.
CREATE FUNCTION app.guest_cleaning_repeat(session_hash text,oid uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid:=service_private.guest_user(session_hash); ord public.service_orders; stay public.reservations; svc public.service_catalog;
BEGIN
 SELECT o.* INTO ord FROM public.service_orders o
 JOIN public.reservations r ON r.id=o.reservation_id AND r.organization_id=o.organization_id AND r.property_id=o.property_id
 JOIN public.guest_profiles g ON g.id=r.primary_guest_id AND g.organization_id=r.organization_id
 JOIN public.service_cleaning_tasks t ON t.order_id=o.id WHERE o.id=oid AND g.user_id=who;
 IF ord.id IS NULL THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF ord.status NOT IN ('completed','cancelled') THEN RAISE EXCEPTION 'SERVICE_TRANSITION_INVALID' USING ERRCODE='23514'; END IF;
 SELECT * INTO stay FROM public.reservations WHERE id=ord.reservation_id;
 IF stay.status<>'checked_in' THEN RAISE EXCEPTION 'SERVICE_STAY_INELIGIBLE' USING ERRCODE='23514'; END IF;
 SELECT * INTO svc FROM public.service_catalog WHERE id=ord.service_id AND organization_id=stay.organization_id AND property_id=stay.property_id
 AND currency=stay.currency AND active AND execution_kind='cleaning' AND price_minor>0;
 IF svc.id IS NULL THEN RAISE EXCEPTION 'SERVICE_UNAVAILABLE' USING ERRCODE='23514'; END IF;
 RETURN jsonb_build_object('items',jsonb_build_array(jsonb_build_object('id',svc.id,'name',svc.name,'currency',svc.currency,'priceMinor',svc.price_minor::text,'revision',svc.revision,'durationMinutes',svc.duration_minutes)));
END $$;
REVOKE ALL ON FUNCTION app.guest_service_feedback(text,uuid,uuid,jsonb),app.guest_cleaning_repeat(text,uuid) FROM PUBLIC;
CREATE OR REPLACE FUNCTION app.guest_cleaning_orders(session_hash text,reservation uuid,after_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid:=service_private.guest_user(session_hash); rows jsonb;
BEGIN
 PERFORM 1 FROM public.reservations r JOIN public.guest_profiles g ON g.id=r.primary_guest_id AND g.organization_id=r.organization_id WHERE r.id=reservation AND g.user_id=who;
 IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('orderId',o.id,'name',o.snapshot->'name','status',o.status,'stage',o.stage,'revision',o.revision,'requestedFor',o.current_requested_for,'currency',o.currency,'totalMinor',o.total_minor::text,'feedback',(SELECT jsonb_build_object('rating',f.rating,'comment',f.comment) FROM public.service_order_feedback f WHERE f.order_id=o.id AND f.author_user_id=who)) ORDER BY o.id),'[]') INTO rows
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
 SELECT coalesce(jsonb_agg(jsonb_build_object('orderId',o.id,'reservationId',o.reservation_id,'unitId',o.snapshot->'unitId','unitCode',(SELECT u.code FROM public.units u WHERE u.id::text=o.snapshot->>'unitId' AND u.property_id=o.property_id),'name',o.snapshot->'name','status',o.status,'stage',o.stage,'revision',o.revision,'assignedMembershipId',o.assigned_membership_id,'requestedFor',o.current_requested_for,'currency',o.currency,'totalMinor',o.total_minor::text,'checklist',o.checklist,'completionNote',o.completion_note,'inspectionNote',o.inspection_note,'feedback',CASE WHEN manager THEN (SELECT jsonb_build_object('rating',f.rating,'comment',f.comment) FROM public.service_order_feedback f WHERE f.order_id=o.id) ELSE NULL END) ORDER BY o.id),'[]') INTO rows
 FROM (SELECT o.*,lower(t.scheduled_period) AS current_requested_for,t.stage,t.revision,t.assigned_membership_id,t.checklist,t.completion_note,t.inspection_note FROM public.service_orders o JOIN public.service_cleaning_tasks t ON t.order_id=o.id
 WHERE o.organization_id=org AND o.property_id=property AND (manager OR t.assigned_membership_id=app.current_membership_id()) AND (after_id IS NULL OR o.id>after_id) ORDER BY o.id LIMIT 51) o;
 RETURN jsonb_build_object('items',rows,'pageSize',50);
END $$;
COMMIT;
