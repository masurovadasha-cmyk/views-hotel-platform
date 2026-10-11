BEGIN;
CREATE OR REPLACE FUNCTION app.staff_cleaning_queue(session_hash text,property uuid,after_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid:=service_private.staff_user(session_hash); org uuid:=app.current_organization_id(); rows jsonb; manager boolean;
BEGIN
 manager:=app.registry_access(org,property,'reservation.manage');
 IF NOT manager AND NOT app.registry_access(org,property,'housekeeping.work') THEN RAISE EXCEPTION 'SERVICE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('orderId',o.id,'reservationId',o.reservation_id,'unitId',o.snapshot->'unitId','unitCode',(SELECT u.code FROM public.units u WHERE u.id::text=o.snapshot->>'unitId' AND u.property_id=o.property_id),'name',o.snapshot->'name','status',o.status,'stage',o.stage,'revision',o.revision,'assignedMembershipId',o.assigned_membership_id,'requestedFor',o.requested_for,'currency',o.currency,'totalMinor',o.total_minor::text,'checklist',o.checklist,'completionNote',o.completion_note,'inspectionNote',o.inspection_note) ORDER BY o.id),'[]') INTO rows
 FROM (SELECT o.*,t.stage,t.revision,t.assigned_membership_id,t.checklist,t.completion_note,t.inspection_note FROM public.service_orders o JOIN public.service_cleaning_tasks t ON t.order_id=o.id
 WHERE o.organization_id=org AND o.property_id=property AND (manager OR t.assigned_membership_id=app.current_membership_id()) AND (after_id IS NULL OR o.id>after_id) ORDER BY o.id LIMIT 51) o;
 RETURN jsonb_build_object('items',rows,'pageSize',50);
END $$;
REVOKE ALL ON FUNCTION app.staff_cleaning_queue(text,uuid,uuid) FROM PUBLIC;
COMMIT;
