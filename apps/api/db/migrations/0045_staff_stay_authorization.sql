BEGIN;
-- Keep live session/role authorization locked through the enclosing stay mutation.
CREATE FUNCTION app.staff_stay_authorize(target_org uuid,target_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE mid uuid; m public.organization_memberships%ROWTYPE;
 c staff_private.credentials%ROWTYPE; s staff_private.sessions%ROWTYPE;
BEGIN
 SELECT membership_id INTO mid FROM staff_private.sessions WHERE token_hash=target_hash;
 IF mid IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO m FROM public.organization_memberships WHERE id=mid AND organization_id=target_org FOR UPDATE;
 IF m.id IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO c FROM staff_private.credentials WHERE membership_id=mid FOR UPDATE;
 SELECT * INTO s FROM staff_private.sessions WHERE token_hash=target_hash FOR UPDATE;
 IF s.id IS NULL OR c.membership_id IS NULL OR NOT c.enabled OR m.status<>'active'
 OR s.revoked_at IS NOT NULL OR s.expires_at<=clock_timestamp() OR s.idle_expires_at<=clock_timestamp()
 OR c.version<>s.credential_version OR m.role_id<>s.role_id
 OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=m.user_id AND status='active')
 OR NOT EXISTS(SELECT 1 FROM public.roles r JOIN public.role_permissions rp ON rp.role_id=r.id
   JOIN public.permissions p ON p.id=rp.permission_id WHERE r.id=m.role_id
   AND r.code='front_desk' AND p.code='reservation.manage') THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('userId',m.user_id,'membershipId',mid);
END $fn$;
REVOKE ALL ON FUNCTION app.staff_stay_authorize(uuid,text) FROM PUBLIC;
COMMIT;
