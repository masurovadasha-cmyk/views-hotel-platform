BEGIN;
-- Read-only current-session predicate for hold recovery; no new role or session privileges.
CREATE FUNCTION app.booking_hold_authorize(session_hash text,target_property uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT app.registry_access(app.current_organization_id(),target_property,'reservation.manage') AND EXISTS(
  SELECT 1 FROM staff_private.sessions s
  JOIN public.organization_memberships m ON m.id=s.membership_id
  JOIN public.users u ON u.id=m.user_id
  JOIN staff_private.credentials c ON c.membership_id=m.id
  WHERE s.token_hash=session_hash AND s.revoked_at IS NULL
   AND s.expires_at>clock_timestamp() AND s.idle_expires_at>clock_timestamp()
   AND m.status='active' AND u.status='active' AND c.enabled
   AND c.version=s.credential_version AND m.role_id=s.role_id
   AND m.id=app.current_membership_id() AND m.organization_id=app.current_organization_id()
   AND u.id=app.current_user_id()
 )
$$;
REVOKE ALL ON FUNCTION app.booking_hold_authorize(text,uuid) FROM PUBLIC;
COMMIT;
