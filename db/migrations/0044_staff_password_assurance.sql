BEGIN;
-- Preserve applied migrations and the existing function ACL.
CREATE OR REPLACE FUNCTION app.staff_auth_change(target_hash text,target_version integer,target_password_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE sid uuid; mid uuid; m public.organization_memberships%ROWTYPE; c staff_private.credentials%ROWTYPE; sess staff_private.sessions%ROWTYPE; key_id text;
BEGIN
 IF target_password_hash IS NULL OR target_password_hash !~ '^scrypt-v1\$131072\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$' THEN RETURN false; END IF;
 SELECT s.id,s.membership_id INTO sid,mid FROM staff_private.sessions s WHERE s.token_hash=target_hash;
 IF sid IS NULL THEN RETURN false; END IF;
 SELECT * INTO m FROM public.organization_memberships WHERE id=mid FOR UPDATE;
 SELECT * INTO c FROM staff_private.credentials WHERE membership_id=mid FOR UPDATE;
 SELECT * INTO sess FROM staff_private.sessions WHERE id=sid FOR UPDATE;
 SELECT id INTO key_id FROM staff_private.passkeys WHERE membership_id=mid FOR UPDATE;
 IF target_version IS NULL OR c.version<>target_version OR m.status<>'active' OR NOT c.enabled
 OR sess.revoked_at IS NOT NULL OR sess.expires_at<=clock_timestamp() OR sess.idle_expires_at<=clock_timestamp()
 OR sess.credential_version<>c.version OR sess.role_id<>m.role_id
 OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=m.user_id AND status='active')
 OR NOT EXISTS(SELECT 1 FROM public.roles WHERE id=m.role_id AND code IN ('front_desk','housekeeper','technician','concierge'))
 THEN RETURN false; END IF;
 -- Enrollment opts this membership into assurance. Neither API flags nor caller
 -- input can downgrade it. Check after every lock wait, within the mutation.
 IF key_id IS NOT NULL AND (sess.passkey_verified_until IS NULL OR sess.passkey_verified_until<=clock_timestamp()) THEN
  RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='STAFF_ASSURANCE_REQUIRED';
 END IF;
 UPDATE staff_private.credentials SET password_hash=target_password_hash,version=version+1,changed_at=now() WHERE membership_id=mid;
 UPDATE staff_private.sessions SET revoked_at=clock_timestamp(),passkey_verified_until=NULL WHERE membership_id=mid AND revoked_at IS NULL;
 UPDATE staff_private.activation_tokens SET used_at=now() WHERE membership_id=mid AND used_at IS NULL;
 INSERT INTO public.audit_log(organization_id,actor_user_id,actor_membership_id,action,entity_type,entity_id)
 VALUES(m.organization_id,m.user_id,m.id,'staff.password_changed','membership',mid);
 RETURN true;
END $fn$;

COMMIT;
