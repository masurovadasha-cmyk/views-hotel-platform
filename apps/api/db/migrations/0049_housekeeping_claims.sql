BEGIN;
ALTER TABLE local_stay_turnovers ADD COLUMN assigned_membership_id uuid REFERENCES organization_memberships(id);
CREATE FUNCTION app.housekeeping_authorize(target_hash text,target_property uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE mid uuid; m public.organization_memberships%ROWTYPE;
 c staff_private.credentials%ROWTYPE; s staff_private.sessions%ROWTYPE; permitted uuid;
BEGIN
 SELECT membership_id INTO mid FROM staff_private.sessions WHERE token_hash=target_hash;
 IF mid IS NULL OR mid<>app.current_membership_id() THEN RETURN false; END IF;
 SELECT * INTO m FROM public.organization_memberships WHERE id=mid
 AND organization_id=app.current_organization_id() AND user_id=app.current_user_id() FOR UPDATE;
 IF m.id IS NULL THEN RETURN false; END IF;
 SELECT * INTO c FROM staff_private.credentials WHERE membership_id=mid FOR UPDATE;
 SELECT * INTO s FROM staff_private.sessions WHERE token_hash=target_hash FOR UPDATE;
 IF s.id IS NULL OR c.membership_id IS NULL OR NOT c.enabled OR m.status<>'active'
 OR s.revoked_at IS NOT NULL OR s.expires_at<=clock_timestamp() OR s.idle_expires_at<=clock_timestamp()
 OR c.version<>s.credential_version OR m.role_id<>s.role_id THEN RETURN false; END IF;
 PERFORM 1 FROM public.users WHERE id=m.user_id AND status='active' FOR SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM 1 FROM public.roles r JOIN public.role_permissions rp ON rp.role_id=r.id
 JOIN public.permissions p ON p.id=rp.permission_id WHERE r.id=m.role_id
 AND r.code='housekeeper' AND p.code='housekeeping.work' FOR SHARE OF r,rp,p;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT property_id INTO permitted FROM public.membership_property_scopes
 WHERE membership_id=mid AND property_id=target_property FOR SHARE;
 RETURN permitted IS NOT NULL AND EXISTS(SELECT 1 FROM public.properties WHERE id=target_property AND organization_id=m.organization_id);
END $fn$;
REVOKE ALL ON FUNCTION app.housekeeping_authorize(text,uuid) FROM PUBLIC;
COMMIT;
