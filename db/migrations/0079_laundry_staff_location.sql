-- Operator location only; guest projections do not expose unit identifiers.
BEGIN;
CREATE OR REPLACE FUNCTION app.laundry_staff_list(session_hash text,property uuid,after_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid:=service_private.staff_user(session_hash); result jsonb;
BEGIN
 IF NOT app.registry_access(app.current_organization_id(),property,'reservation.manage') THEN RAISE EXCEPTION 'SERVICE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg((service_private.laundry_receipt(i) || jsonb_build_object('unitCode',(SELECT u.code FROM public.reservations r JOIN public.units u ON u.id=r.unit_id AND u.property_id=r.property_id WHERE r.id=i.reservation_id AND r.organization_id=i.organization_id AND r.property_id=i.property_id))) ORDER BY i.id),'[]') INTO result FROM (SELECT * FROM public.laundry_intakes WHERE organization_id=app.current_organization_id() AND property_id=property AND (after_id IS NULL OR id>after_id) ORDER BY id LIMIT 51) i;
 RETURN jsonb_build_object('items',result);
END $$;
COMMIT;
