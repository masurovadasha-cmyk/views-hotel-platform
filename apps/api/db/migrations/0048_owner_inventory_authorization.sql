BEGIN;
-- Lock existing authority for a draft inventory transaction. No role/session is
-- created, promoted or activated by this function.
CREATE FUNCTION app.owner_inventory_authorize()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE permitted uuid;
BEGIN
 SELECT m.id INTO permitted FROM public.organization_memberships m
 JOIN public.users u ON u.id=m.user_id
 JOIN public.roles r ON r.id=m.role_id
 JOIN public.role_permissions rp ON rp.role_id=r.id
 JOIN public.permissions p ON p.id=rp.permission_id
 WHERE m.id=app.current_membership_id() AND m.organization_id=app.current_organization_id()
 AND m.user_id=app.current_user_id() AND m.status='active' AND u.status='active'
 AND r.code IN ('owner','manager') AND p.code='property.manage'
 FOR SHARE OF m,u,r,rp,p;
 RETURN permitted IS NOT NULL;
END $fn$;
REVOKE ALL ON FUNCTION app.owner_inventory_authorize() FROM PUBLIC;
COMMIT;
