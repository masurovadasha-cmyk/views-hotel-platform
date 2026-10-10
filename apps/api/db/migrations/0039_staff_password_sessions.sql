BEGIN;

-- Credentials are server-private, not tenant-visible business data. Existing
-- GRANT ... ON ALL TABLES IN public cannot expose this schema or its tables.
CREATE SCHEMA staff_private;
REVOKE ALL ON SCHEMA staff_private FROM PUBLIC;
CREATE TABLE staff_private.credentials (
  membership_id uuid PRIMARY KEY REFERENCES public.organization_memberships(id),
  password_hash text NOT NULL CHECK(password_hash ~ '^scrypt-v1\$131072\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$'),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  enabled boolean NOT NULL DEFAULT true,
  verification_channel text NOT NULL CHECK(verification_channel IN ('email','local_fixture')),
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE staff_private.activation_tokens (
  token_hash text PRIMARY KEY CHECK(token_hash ~ '^[a-f0-9]{64}$'),
  membership_id uuid NOT NULL REFERENCES public.organization_memberships(id),
  purpose text NOT NULL CHECK(purpose IN ('invite','reset')),
  expected_version integer,
  verification_channel text NOT NULL CHECK(verification_channel IN ('email','local_fixture')),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX staff_activation_member ON staff_private.activation_tokens(membership_id,purpose);
CREATE TABLE staff_private.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),
  membership_id uuid NOT NULL REFERENCES staff_private.credentials(membership_id),
  credential_version integer NOT NULL,
  role_id uuid NOT NULL REFERENCES public.roles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '8 hours',
  idle_expires_at timestamptz NOT NULL DEFAULT now()+interval '30 minutes',
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX staff_sessions_member ON staff_private.sessions(membership_id,created_at);

-- Operator-only issuance. Not in app schema: the runtime's blanket app EXECUTE
-- grant does not authorize account creation, invitations or resets.
CREATE FUNCTION staff_private.issue_token(target_membership uuid,target_purpose text,target_hash text,target_channel text)
RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
DECLARE m public.organization_memberships%ROWTYPE; v integer; role_code text;
BEGIN
  IF target_purpose IS NULL OR target_purpose NOT IN ('invite','reset') OR target_hash IS NULL OR target_hash !~ '^[a-f0-9]{64}$'
     OR target_channel IS NULL OR target_channel NOT IN ('email','local_fixture') THEN RAISE EXCEPTION 'STAFF_TOKEN_CONFIG_INVALID'; END IF;
  SELECT * INTO m FROM public.organization_memberships WHERE id=target_membership FOR UPDATE;
  SELECT code INTO role_code FROM public.roles WHERE id=m.role_id;
  IF m.id IS NULL OR role_code NOT IN ('front_desk','housekeeper','technician','concierge') THEN RAISE EXCEPTION 'STAFF_PILOT_ROLE_DENIED'; END IF;
  SELECT version INTO v FROM staff_private.credentials WHERE membership_id=m.id FOR UPDATE;
  IF (target_purpose='invite' AND (v IS NOT NULL OR m.status<>'invited')) OR
     (target_purpose='reset' AND (v IS NULL OR m.status<>'active')) THEN RAISE EXCEPTION 'STAFF_TOKEN_STATE_INVALID'; END IF;
  UPDATE staff_private.activation_tokens SET used_at=now() WHERE membership_id=m.id AND purpose=target_purpose AND used_at IS NULL;
  INSERT INTO staff_private.activation_tokens(token_hash,membership_id,purpose,expected_version,verification_channel,expires_at)
  VALUES(target_hash,m.id,target_purpose,v,target_channel,now()+interval '24 hours');
  INSERT INTO public.audit_log(organization_id,actor_user_id,action,entity_type,entity_id,after_state)
  VALUES(m.organization_id,m.user_id,'staff.token_issued','membership',m.id,jsonb_build_object('purpose',target_purpose,'channel',target_channel));
  RETURN true;
END $fn$;
REVOKE ALL ON FUNCTION staff_private.issue_token(uuid,text,text,text) FROM PUBLIC;

CREATE FUNCTION app.staff_auth_accept(target_org uuid,target_hash text,target_purpose text,target_password_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE t staff_private.activation_tokens%ROWTYPE; m public.organization_memberships%ROWTYPE; v integer; role_code text;
BEGIN
  IF target_org IS NULL OR target_hash IS NULL OR target_hash !~ '^[a-f0-9]{64}$' OR target_purpose IS NULL OR target_purpose NOT IN ('invite','reset')
     OR target_password_hash IS NULL OR target_password_hash !~ '^scrypt-v1\$131072\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$' THEN RETURN false; END IF;
  -- Always lock membership -> credential -> token to avoid login/reset deadlocks.
  SELECT * INTO t FROM staff_private.activation_tokens WHERE token_hash=target_hash;
  IF t.membership_id IS NULL THEN RETURN false; END IF;
  SELECT * INTO m FROM public.organization_memberships WHERE id=t.membership_id AND organization_id=target_org FOR UPDATE;
  IF m.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=m.user_id AND status='active') THEN RETURN false; END IF;
  SELECT version INTO v FROM staff_private.credentials WHERE membership_id=m.id FOR UPDATE;
  SELECT * INTO t FROM staff_private.activation_tokens WHERE token_hash=target_hash FOR UPDATE;
  SELECT code INTO role_code FROM public.roles WHERE id=m.role_id;
  IF t.used_at IS NOT NULL OR t.expires_at<=now() OR t.purpose<>target_purpose OR role_code NOT IN ('front_desk','housekeeper','technician','concierge') THEN RETURN false; END IF;
  IF target_purpose='invite' THEN
    IF m.status<>'invited' OR v IS NOT NULL THEN RETURN false; END IF;
    INSERT INTO staff_private.credentials(membership_id,password_hash,verification_channel) VALUES(m.id,target_password_hash,t.verification_channel);
    UPDATE public.organization_memberships SET status='active',joined_at=COALESCE(joined_at,now()) WHERE id=m.id;
  ELSE
    IF m.status<>'active' OR v IS NULL OR v<>t.expected_version THEN RETURN false; END IF;
    UPDATE staff_private.credentials SET password_hash=target_password_hash,version=version+1,enabled=true,changed_at=now() WHERE membership_id=m.id;
  END IF;
  UPDATE staff_private.activation_tokens SET used_at=now() WHERE membership_id=m.id AND used_at IS NULL;
  UPDATE staff_private.sessions SET revoked_at=now() WHERE membership_id=m.id AND revoked_at IS NULL;
  INSERT INTO public.audit_log(organization_id,actor_user_id,actor_membership_id,action,entity_type,entity_id)
  VALUES(m.organization_id,m.user_id,m.id,CASE WHEN target_purpose='invite' THEN 'staff.invitation_accepted' ELSE 'staff.password_reset' END,'membership',m.id);
  RETURN true;
END $fn$;

CREATE FUNCTION app.staff_auth_lookup(target_org uuid,target_email text)
RETURNS TABLE(membership_id uuid,password_hash text,version integer)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
 SELECT c.membership_id,c.password_hash,c.version FROM staff_private.credentials c
 JOIN public.organization_memberships m ON m.id=c.membership_id
 JOIN public.users u ON u.id=m.user_id JOIN public.roles r ON r.id=m.role_id
 WHERE m.organization_id=target_org AND lower(u.email)=target_email AND u.status='active'
   AND m.status='active' AND c.enabled AND r.code IN ('front_desk','housekeeper','technician','concierge') LIMIT 2
$fn$;

CREATE FUNCTION app.staff_auth_start(target_member uuid,target_version integer,target_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE m public.organization_memberships%ROWTYPE; c staff_private.credentials%ROWTYPE; sid uuid;
BEGIN
 IF target_hash IS NULL OR target_hash !~ '^[a-f0-9]{64}$' OR target_version IS NULL THEN RETURN false; END IF;
 SELECT * INTO m FROM public.organization_memberships WHERE id=target_member FOR UPDATE;
 SELECT * INTO c FROM staff_private.credentials WHERE membership_id=m.id FOR UPDATE;
 IF c.membership_id IS NULL OR NOT c.enabled OR c.version<>target_version OR m.status<>'active'
 OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=m.user_id AND status='active')
 OR NOT EXISTS(SELECT 1 FROM public.roles WHERE id=m.role_id AND code IN ('front_desk','housekeeper','technician','concierge')) THEN RETURN false; END IF;
 INSERT INTO staff_private.sessions(token_hash,membership_id,credential_version,role_id)
 VALUES(target_hash,m.id,c.version,m.role_id) RETURNING id INTO sid;
 UPDATE staff_private.sessions SET revoked_at=now() WHERE id IN (
   SELECT id FROM staff_private.sessions WHERE membership_id=m.id AND revoked_at IS NULL ORDER BY created_at DESC,id DESC OFFSET 5
 );
 INSERT INTO public.audit_log(organization_id,actor_user_id,actor_membership_id,action,entity_type,entity_id)
 VALUES(m.organization_id,m.user_id,m.id,'staff.login','staff_session',sid);
 RETURN true;
END $fn$;

CREATE FUNCTION app.staff_auth_resolve(target_hash text)
RETURNS TABLE(organization_id uuid,user_id uuid,membership_id uuid,email text,display_name text,role_code text,
 permissions text[],property_ids uuid[],expires_at timestamptz,credential_version integer,verification_channel text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE s staff_private.sessions%ROWTYPE; m public.organization_memberships%ROWTYPE; c staff_private.credentials%ROWTYPE;
BEGIN
 SELECT * INTO s FROM staff_private.sessions WHERE token_hash=target_hash;
 IF s.id IS NULL OR s.revoked_at IS NOT NULL OR s.expires_at<=now() OR s.idle_expires_at<=now() THEN RETURN; END IF;
 SELECT * INTO m FROM public.organization_memberships WHERE id=s.membership_id;
 SELECT * INTO c FROM staff_private.credentials WHERE staff_private.credentials.membership_id=m.id;
 IF m.status<>'active' OR c.membership_id IS NULL OR NOT c.enabled OR c.version<>s.credential_version OR m.role_id<>s.role_id
    OR NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=m.user_id AND u.status='active') THEN RETURN; END IF;
 UPDATE staff_private.sessions SET last_seen_at=now(),idle_expires_at=LEAST(staff_private.sessions.expires_at,now()+interval '30 minutes')
 WHERE id=s.id AND revoked_at IS NULL;
 IF NOT FOUND THEN RETURN; END IF;
 RETURN QUERY SELECT m.organization_id,m.user_id,m.id,u.email,u.display_name,r.code,
   ARRAY(SELECT p.code FROM public.role_permissions rp JOIN public.permissions p ON p.id=rp.permission_id WHERE rp.role_id=m.role_id ORDER BY p.code),
   ARRAY(SELECT ms.property_id FROM public.membership_property_scopes ms WHERE ms.membership_id=m.id ORDER BY ms.property_id),
   s.expires_at,c.version,c.verification_channel FROM public.users u JOIN public.roles r ON r.id=m.role_id WHERE u.id=m.user_id;
END $fn$;

CREATE FUNCTION app.staff_auth_logout(target_hash text,target_all boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE sid uuid; mid uuid; m public.organization_memberships%ROWTYPE;
BEGIN
 SELECT s.id,s.membership_id INTO sid,mid FROM staff_private.sessions s WHERE s.token_hash=target_hash AND s.revoked_at IS NULL
 AND s.expires_at>now() AND s.idle_expires_at>now();
 IF sid IS NULL THEN RETURN true; END IF;
 SELECT * INTO m FROM public.organization_memberships WHERE id=mid FOR UPDATE;
 IF target_all IS TRUE THEN
   UPDATE staff_private.credentials SET version=version+1 WHERE membership_id=mid;
   UPDATE staff_private.sessions SET revoked_at=now() WHERE membership_id=mid AND revoked_at IS NULL;
 ELSE UPDATE staff_private.sessions SET revoked_at=now() WHERE id=sid; END IF;
 INSERT INTO public.audit_log(organization_id,actor_user_id,actor_membership_id,action,entity_type,entity_id)
 VALUES(m.organization_id,m.user_id,m.id,CASE WHEN target_all IS TRUE THEN 'staff.logout_all' ELSE 'staff.logout' END,'staff_session',sid);
 RETURN true;
END $fn$;

CREATE FUNCTION app.staff_auth_change(target_hash text,target_version integer,target_password_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE sid uuid; mid uuid; m public.organization_memberships%ROWTYPE; c staff_private.credentials%ROWTYPE;
BEGIN
 IF target_password_hash IS NULL OR target_password_hash !~ '^scrypt-v1\$131072\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$' THEN RETURN false; END IF;
 SELECT s.id,s.membership_id INTO sid,mid FROM staff_private.sessions s WHERE s.token_hash=target_hash;
 IF sid IS NULL THEN RETURN false; END IF;
 SELECT * INTO m FROM public.organization_memberships WHERE id=mid FOR UPDATE;
 SELECT * INTO c FROM staff_private.credentials WHERE membership_id=mid FOR UPDATE;
 IF target_version IS NULL OR c.version<>target_version OR m.status<>'active' OR NOT c.enabled
 OR NOT EXISTS(SELECT 1 FROM staff_private.sessions s WHERE s.id=sid AND s.revoked_at IS NULL
   AND s.expires_at>now() AND s.idle_expires_at>now() AND s.credential_version=c.version AND s.role_id=m.role_id)
 THEN RETURN false; END IF;
 UPDATE staff_private.credentials SET password_hash=target_password_hash,version=version+1,changed_at=now() WHERE membership_id=mid;
 UPDATE staff_private.sessions SET revoked_at=now() WHERE membership_id=mid AND revoked_at IS NULL;
 UPDATE staff_private.activation_tokens SET used_at=now() WHERE membership_id=mid AND used_at IS NULL;
 INSERT INTO public.audit_log(organization_id,actor_user_id,actor_membership_id,action,entity_type,entity_id)
 VALUES(m.organization_id,m.user_id,m.id,'staff.password_changed','membership',mid);
 RETURN true;
END $fn$;

REVOKE ALL ON ALL TABLES IN SCHEMA staff_private FROM PUBLIC;
DO $revoke$
DECLARE f record;
BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='app' AND p.proname LIKE 'staff_auth_%'
 LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f.signature); END LOOP;
END $revoke$;

-- Offboarding cannot resurrect a former session when membership is re-enabled.
CREATE FUNCTION staff_private.revoke_membership_sessions() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $trigger$
BEGIN
 IF NEW.status IS DISTINCT FROM OLD.status OR NEW.role_id IS DISTINCT FROM OLD.role_id THEN
  UPDATE staff_private.sessions SET revoked_at=now() WHERE membership_id=NEW.id AND revoked_at IS NULL;
 END IF;
 RETURN NEW;
END $trigger$;
CREATE TRIGGER staff_revoke_on_membership_change AFTER UPDATE OF status,role_id ON public.organization_memberships
FOR EACH ROW EXECUTE FUNCTION staff_private.revoke_membership_sessions();
CREATE FUNCTION staff_private.revoke_user_sessions() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $trigger$
BEGIN
 IF NEW.status IS DISTINCT FROM OLD.status THEN
  UPDATE staff_private.sessions s SET revoked_at=now() FROM public.organization_memberships m
  WHERE m.user_id=NEW.id AND s.membership_id=m.id AND s.revoked_at IS NULL;
 END IF;
 RETURN NEW;
END $trigger$;
CREATE TRIGGER staff_revoke_on_user_change AFTER UPDATE OF status ON public.users
FOR EACH ROW EXECUTE FUNCTION staff_private.revoke_user_sessions();
REVOKE ALL ON FUNCTION staff_private.revoke_membership_sessions() FROM PUBLIC;
REVOKE ALL ON FUNCTION staff_private.revoke_user_sessions() FROM PUBLIC;
COMMIT;
