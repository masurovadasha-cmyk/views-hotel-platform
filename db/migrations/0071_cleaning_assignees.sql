BEGIN;
CREATE FUNCTION app.cleaning_assignees(session_hash text,property uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid:=service_private.staff_user(session_hash); result jsonb;
BEGIN
 IF NOT app.registry_access(app.current_organization_id(),property,'reservation.manage') THEN
 RAISE EXCEPTION 'SERVICE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'name',m.display_name) ORDER BY m.id),'[]') INTO result
 FROM (SELECT m.id,u.display_name FROM public.organization_memberships m
 JOIN public.users u ON u.id=m.user_id AND u.status='active'
 JOIN public.roles r ON r.id=m.role_id AND r.code='housekeeper'
 JOIN public.membership_property_scopes s ON s.membership_id=m.id AND s.property_id=property
 WHERE m.organization_id=app.current_organization_id() AND m.status='active'
 AND EXISTS(SELECT 1 FROM public.role_permissions rp JOIN public.permissions p ON p.id=rp.permission_id WHERE rp.role_id=r.id AND p.code='housekeeping.work')
 ORDER BY m.id LIMIT 501) m;
 RETURN jsonb_build_object('items',result);
END $$;
REVOKE ALL ON FUNCTION app.cleaning_assignees(text,uuid) FROM PUBLIC;
COMMIT;
