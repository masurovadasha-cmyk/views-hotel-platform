BEGIN;
-- Dormant local pilot. No change to role allowlists, login or business permissions.
CREATE TABLE staff_private.passkeys (
 id text PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 1024 AND id ~ '^[A-Za-z0-9_-]+$'),
 membership_id uuid NOT NULL UNIQUE REFERENCES staff_private.credentials(membership_id),
 public_key bytea NOT NULL CHECK(octet_length(public_key) BETWEEN 16 AND 4096),
 counter bigint NOT NULL CHECK(counter BETWEEN 0 AND 4294967295),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE staff_private.passkey_challenges (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 session_id uuid NOT NULL REFERENCES staff_private.sessions(id),
 purpose text NOT NULL CHECK(purpose IN ('register','authenticate')),
 challenge_hash text NOT NULL CHECK(challenge_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '2 minutes',
 claimed_at timestamptz, finished_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX staff_passkey_challenge_session ON staff_private.passkey_challenges(session_id);
ALTER TABLE staff_private.sessions ADD COLUMN passkey_verified_until timestamptz;
REVOKE ALL ON staff_private.passkeys,staff_private.passkey_challenges FROM PUBLIC;

-- Locks follow the existing membership -> password credential -> session order.
-- Every finish rechecks the live session and its password version after locking.
CREATE FUNCTION app.staff_mfa(target_org uuid,target_session text,operation text,input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE s staff_private.sessions%ROWTYPE; m public.organization_memberships%ROWTYPE;
 c staff_private.credentials%ROWTYPE; k staff_private.passkeys%ROWTYPE;
 q staff_private.passkey_challenges%ROWTYPE; mid uuid; next_counter bigint;
BEGIN
 SELECT membership_id INTO mid FROM staff_private.sessions WHERE token_hash=target_session;
 IF mid IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO m FROM public.organization_memberships WHERE id=mid AND organization_id=target_org FOR UPDATE;
 IF m.id IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO c FROM staff_private.credentials WHERE membership_id=mid FOR UPDATE;
 SELECT * INTO s FROM staff_private.sessions WHERE token_hash=target_session FOR UPDATE;
 IF s.revoked_at IS NOT NULL OR s.expires_at<=clock_timestamp() OR s.idle_expires_at<=clock_timestamp()
 OR NOT c.enabled OR c.version<>s.credential_version OR m.status<>'active' OR m.role_id<>s.role_id
 OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=m.user_id AND status='active')
 OR NOT EXISTS(SELECT 1 FROM public.roles WHERE id=m.role_id AND code IN ('front_desk','housekeeper','technician','concierge')) THEN RETURN NULL; END IF;
 SELECT * INTO k FROM staff_private.passkeys WHERE membership_id=mid FOR UPDATE;
 IF operation='state' THEN
  RETURN jsonb_build_object('registered',k.id IS NOT NULL,'verifiedUntil',
   CASE WHEN k.id IS NOT NULL AND s.passkey_verified_until>clock_timestamp() THEN s.passkey_verified_until ELSE NULL END);
 ELSIF operation='begin' THEN
  IF input->>'purpose' NOT IN ('register','authenticate') OR input->>'challengeHash' IS NULL
   OR input->>'challengeHash' !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
  IF ((input->>'purpose')='register')<>(k.id IS NULL) THEN RETURN NULL; END IF;
  -- At most 12 ceremonies per live session per five minutes. Bound accumulation.
  IF (SELECT count(*) FROM staff_private.passkey_challenges WHERE session_id=s.id AND created_at>now()-interval '5 minutes')>=12 THEN RETURN NULL; END IF;
  DELETE FROM staff_private.passkey_challenges WHERE session_id=s.id AND expires_at<now()-interval '1 day';
  UPDATE staff_private.passkey_challenges SET finished_at=now() WHERE session_id=s.id AND finished_at IS NULL;
  INSERT INTO staff_private.passkey_challenges(session_id,purpose,challenge_hash)
  VALUES(s.id,input->>'purpose',input->>'challengeHash') RETURNING * INTO q;
  RETURN jsonb_build_object('id',q.id,'credentialId',k.id);
 END IF;
 SELECT * INTO q FROM staff_private.passkey_challenges WHERE id=(input->>'challengeId')::uuid AND session_id=s.id FOR UPDATE;
 IF q.id IS NULL OR q.finished_at IS NOT NULL OR q.expires_at<=clock_timestamp() OR q.purpose IS DISTINCT FROM input->>'purpose' THEN RETURN NULL; END IF;
 IF operation='claim' THEN
  IF q.claimed_at IS NOT NULL THEN RETURN NULL; END IF;
  UPDATE staff_private.passkey_challenges SET claimed_at=clock_timestamp() WHERE id=q.id;
  RETURN jsonb_build_object('membershipId',mid,'challengeHash',q.challenge_hash,'credentialId',k.id,'publicKey',encode(k.public_key,'base64'),'counter',k.counter);
 ELSIF operation='finish' THEN
  IF q.claimed_at IS NULL THEN RETURN NULL; END IF;
  next_counter:=(input->>'counter')::bigint;
  IF next_counter IS NULL OR next_counter<0 OR next_counter>4294967295 THEN RETURN NULL; END IF;
  IF q.purpose='register' THEN
   IF k.id IS NOT NULL OR input->>'credentialId' IS NULL OR input->>'publicKey' IS NULL THEN RETURN NULL; END IF;
   INSERT INTO staff_private.passkeys(id,membership_id,public_key,counter)
   VALUES(input->>'credentialId',mid,decode(input->>'publicKey','base64'),next_counter);
  ELSE
   IF k.id IS NULL OR k.id IS DISTINCT FROM input->>'credentialId' OR k.counter IS DISTINCT FROM (input->>'previousCounter')::bigint
    OR ((next_counter>0 OR k.counter>0) AND next_counter<=k.counter) THEN RETURN NULL; END IF;
   UPDATE staff_private.passkeys SET counter=next_counter WHERE id=k.id;
  END IF;
  UPDATE staff_private.passkey_challenges SET finished_at=clock_timestamp() WHERE id=q.id;
  UPDATE staff_private.sessions SET passkey_verified_until=LEAST(expires_at,clock_timestamp()+interval '5 minutes') WHERE id=s.id;
  INSERT INTO public.audit_log(organization_id,actor_user_id,actor_membership_id,action,entity_type,entity_id)
  VALUES(target_org,m.user_id,mid,CASE WHEN q.purpose='register' THEN 'staff.passkey_registered' ELSE 'staff.passkey_verified' END,'staff_session',s.id);
  RETURN jsonb_build_object('ok',true);
 END IF;
 RETURN NULL;
END $fn$;
REVOKE ALL ON FUNCTION app.staff_mfa(uuid,text,text,jsonb) FROM PUBLIC;
COMMIT;
