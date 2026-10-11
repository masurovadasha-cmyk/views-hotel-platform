BEGIN;
-- Active queue only. Deadline filtering happens before bounded keyset pagination.
CREATE INDEX concierge_active_queue_idx ON concierge_requests(organization_id,property_id,order_id)
 INCLUDE(response_due_at,assigned_membership_id) WHERE stage IN ('requested','working');

CREATE FUNCTION app.concierge_staff_overdue(session_hash text,property uuid,after_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
 who uuid:=service_private.staff_user(session_hash);
 manager boolean:=app.registry_access(app.current_organization_id(),property,'reservation.manage');
 evaluated_at timestamptz:=date_trunc('milliseconds',statement_timestamp());
 rows jsonb;
BEGIN
 IF NOT manager AND NOT app.registry_access(app.current_organization_id(),property,'concierge.work') THEN
  RAISE EXCEPTION 'SERVICE_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 SELECT coalesce(jsonb_agg(service_private.concierge_receipt(q.order_id)||jsonb_build_object(
  'unitCode',q.code,'mine',q.assigned_membership_id=app.current_membership_id()) ORDER BY q.order_id),'[]'::jsonb) INTO rows
 FROM (
  SELECT c.order_id,c.assigned_membership_id,u.code
  FROM public.concierge_requests c
  JOIN public.service_orders o ON o.id=c.order_id
  JOIN public.reservations r ON r.id=o.reservation_id
  LEFT JOIN public.units u ON u.id=r.unit_id AND u.property_id=r.property_id
  WHERE c.organization_id=app.current_organization_id() AND c.property_id=property
   AND (manager OR c.assigned_membership_id IS NULL OR c.assigned_membership_id=app.current_membership_id())
   AND c.stage IN ('requested','working') AND c.response_due_at<evaluated_at
   AND (after_id IS NULL OR c.order_id>after_id)
  ORDER BY c.order_id LIMIT 3 FOR SHARE OF c
 ) q;
 RETURN jsonb_build_object('items',rows,'evaluatedAt',evaluated_at);
END $$;
REVOKE ALL ON FUNCTION app.concierge_staff_overdue(text,uuid,uuid) FROM PUBLIC;
-- Existing installations use the scoped runtime role; clean bootstrap grants after role creation.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='views_app') THEN
  GRANT EXECUTE ON FUNCTION app.concierge_staff_overdue(text,uuid,uuid) TO views_app;
 END IF;
END $$;
COMMIT;
