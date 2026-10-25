BEGIN;
-- Read-only current-session predicate for owner-calendar recovery; no new role or session privileges.
CREATE FUNCTION app.owner_calendar_authorize(session_hash text,target_property uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM public.properties p JOIN public.organizations o ON o.id=p.organization_id WHERE p.id=target_property AND p.organization_id=app.current_organization_id() AND p.status='active' AND o.type='platform' AND p.country_code='UZ' AND p.timezone='Asia/Tashkent') AND EXISTS(
  SELECT 1 FROM staff_private.sessions s
  JOIN public.organization_memberships m ON m.id=s.membership_id
  JOIN public.users u ON u.id=m.user_id
  JOIN staff_private.credentials c ON c.membership_id=m.id
  JOIN public.roles r ON r.id=m.role_id
  JOIN public.role_permissions rp ON rp.role_id=r.id
  JOIN public.permissions p ON p.id=rp.permission_id
  WHERE s.token_hash=session_hash AND s.revoked_at IS NULL
   AND s.expires_at>clock_timestamp() AND s.idle_expires_at>clock_timestamp()
   AND r.code IN ('owner','manager') AND p.code='property.manage'
   AND m.status='active' AND u.status='active' AND c.enabled
   AND c.version=s.credential_version AND m.role_id=s.role_id
   AND m.id=app.current_membership_id() AND m.organization_id=app.current_organization_id()
   AND u.id=app.current_user_id()
 )
$$;
REVOKE ALL ON FUNCTION app.owner_calendar_authorize(text,uuid) FROM PUBLIC;
COMMIT;
