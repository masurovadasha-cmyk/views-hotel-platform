BEGIN;
-- Applied 0042 remains immutable. Existing unfinished ceremonies are invalidated
-- because they predate the binding to a specific enrolled passkey.
UPDATE staff_private.passkey_challenges SET finished_at=clock_timestamp() WHERE finished_at IS NULL;
ALTER TABLE staff_private.passkey_challenges ADD COLUMN expected_passkey_id text;
ALTER TABLE staff_private.passkey_challenges DROP CONSTRAINT passkey_challenges_purpose_check;
ALTER TABLE staff_private.passkey_challenges ADD CONSTRAINT passkey_challenges_purpose_check CHECK(purpose IN ('register','authenticate','replace'));
CREATE TABLE staff_private.passkey_recovery_codes (
 code_hash text PRIMARY KEY CHECK(code_hash ~ '^[a-f0-9]{64}$'),
 membership_id uuid NOT NULL REFERENCES staff_private.credentials(membership_id),
 passkey_id text NOT NULL REFERENCES staff_private.passkeys(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '180 days',
 used_at timestamptz
);
CREATE INDEX passkey_recovery_membership ON staff_private.passkey_recovery_codes(membership_id);
REVOKE ALL ON staff_private.passkey_recovery_codes FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.staff_mfa(target_org uuid,target_session text,operation text,input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE s staff_private.sessions%ROWTYPE; m public.organization_memberships%ROWTYPE;
 c staff_private.credentials%ROWTYPE; k staff_private.passkeys%ROWTYPE;
 q staff_private.passkey_challenges%ROWTYPE; mid uuid; next_counter bigint; hashes jsonb; recovery_digest text;
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
  RETURN jsonb_build_object('registered',k.id IS NOT NULL,'recoveryCodesRemaining',(SELECT count(*) FROM staff_private.passkey_recovery_codes WHERE membership_id=mid AND used_at IS NULL AND expires_at>clock_timestamp()),'verifiedUntil',
   CASE WHEN k.id IS NOT NULL AND s.passkey_verified_until>clock_timestamp() THEN s.passkey_verified_until ELSE NULL END);
 ELSIF operation='recovery_codes' THEN
  IF k.id IS NULL OR s.passkey_verified_until IS NULL OR s.passkey_verified_until<=clock_timestamp() THEN RETURN NULL; END IF;
  hashes:=input->'hashes';
  IF jsonb_typeof(hashes) IS DISTINCT FROM 'array' OR jsonb_array_length(hashes)<>8 THEN RETURN NULL; END IF;
  IF (SELECT count(DISTINCT h) FROM jsonb_array_elements_text(hashes) h WHERE h ~ '^[a-f0-9]{64}$')<>8 THEN RETURN NULL; END IF;
  DELETE FROM staff_private.passkey_recovery_codes WHERE membership_id=mid;
  INSERT INTO staff_private.passkey_recovery_codes(code_hash,membership_id,passkey_id)
  SELECT h,mid,k.id FROM jsonb_array_elements_text(hashes) h;
  UPDATE staff_private.sessions SET passkey_verified_until=NULL WHERE id=s.id;
  INSERT INTO public.audit_log(organization_id,actor_user_id,actor_membership_id,action,entity_type,entity_id)
  VALUES(target_org,m.user_id,mid,'staff.recovery_codes_rotated','staff_session',s.id);
  RETURN jsonb_build_object('ok',true);
 ELSIF operation='begin' THEN
  IF input->>'purpose' NOT IN ('register','authenticate','replace') OR input->>'challengeHash' IS NULL
   OR input->>'challengeHash' !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
  IF ((input->>'purpose')='register')<>(k.id IS NULL) THEN RETURN NULL; END IF;
  -- At most 12 ceremonies per live session per five minutes. Bound accumulation.
  IF (SELECT count(*) FROM staff_private.passkey_challenges WHERE session_id=s.id AND created_at>now()-interval '5 minutes')>=12 THEN RETURN NULL; END IF;
  IF input->>'purpose'='replace' THEN
   recovery_digest:=input->>'recoveryHash';
   IF recovery_digest IS NOT NULL THEN
    UPDATE staff_private.passkey_recovery_codes SET used_at=clock_timestamp()
    WHERE staff_private.passkey_recovery_codes.code_hash=recovery_digest AND membership_id=mid AND passkey_id=k.id
     AND used_at IS NULL AND expires_at>clock_timestamp();
    IF NOT FOUND THEN RETURN NULL; END IF;
   ELSIF s.passkey_verified_until IS NULL OR s.passkey_verified_until<=clock_timestamp() THEN RETURN NULL;
   END IF;
   -- Consumed authorization permits only this one enrollment, never a session upgrade.
   UPDATE staff_private.sessions SET passkey_verified_until=NULL WHERE id=s.id;
   INSERT INTO public.audit_log(organization_id,actor_user_id,actor_membership_id,action,entity_type,entity_id,after_state)
   VALUES(target_org,m.user_id,mid,'staff.passkey_replacement_started','staff_session',s.id,
    jsonb_build_object('method',CASE WHEN recovery_digest IS NULL THEN 'passkey' ELSE 'recovery_code' END));
  END IF;
  DELETE FROM staff_private.passkey_challenges WHERE session_id=s.id AND expires_at<now()-interval '1 day';
  UPDATE staff_private.passkey_challenges SET finished_at=now() WHERE session_id=s.id AND finished_at IS NULL;
  INSERT INTO staff_private.passkey_challenges(session_id,purpose,challenge_hash,expected_passkey_id)
  VALUES(s.id,input->>'purpose',input->>'challengeHash',k.id) RETURNING * INTO q;
  RETURN jsonb_build_object('id',q.id,'credentialId',k.id);
 END IF;
 SELECT * INTO q FROM staff_private.passkey_challenges WHERE id=(input->>'challengeId')::uuid AND session_id=s.id FOR UPDATE;
 IF q.expected_passkey_id IS DISTINCT FROM k.id THEN RETURN NULL; END IF;
 IF q.id IS NULL OR q.finished_at IS NOT NULL OR q.expires_at<=clock_timestamp() OR q.purpose IS DISTINCT FROM input->>'purpose' THEN RETURN NULL; END IF;
 IF operation='claim' THEN
  IF q.claimed_at IS NOT NULL THEN RETURN NULL; END IF;
  UPDATE staff_private.passkey_challenges SET claimed_at=clock_timestamp() WHERE id=q.id;
  RETURN jsonb_build_object('membershipId',mid,'challengeHash',q.challenge_hash,'credentialId',k.id,'publicKey',encode(k.public_key,'base64'),'counter',k.counter);
 ELSIF operation='finish' THEN
  IF q.claimed_at IS NULL THEN RETURN NULL; END IF;
  next_counter:=(input->>'counter')::bigint;
  IF next_counter IS NULL OR next_counter<0 OR next_counter>4294967295 THEN RETURN NULL; END IF;
  IF q.purpose IN ('register','replace') THEN
   IF (q.purpose='register' AND k.id IS NOT NULL) OR input->>'credentialId' IS NULL OR input->>'publicKey' IS NULL THEN RETURN NULL; END IF;
   IF q.purpose='replace' THEN
    IF k.id IS NULL OR k.id=input->>'credentialId' THEN RETURN NULL; END IF;
    DELETE FROM staff_private.passkeys WHERE id=k.id;
   END IF;
   INSERT INTO staff_private.passkeys(id,membership_id,public_key,counter)
   VALUES(input->>'credentialId',mid,decode(input->>'publicKey','base64'),next_counter);
  ELSE
   IF k.id IS NULL OR k.id IS DISTINCT FROM input->>'credentialId' OR k.counter IS DISTINCT FROM (input->>'previousCounter')::bigint
    OR ((next_counter>0 OR k.counter>0) AND next_counter<=k.counter) THEN RETURN NULL; END IF;
   UPDATE staff_private.passkeys SET counter=next_counter WHERE id=k.id;
  END IF;
  UPDATE staff_private.passkey_challenges SET finished_at=clock_timestamp() WHERE id=q.id;
  IF q.purpose='replace' THEN
   UPDATE staff_private.sessions SET revoked_at=COALESCE(revoked_at,clock_timestamp()),passkey_verified_until=NULL WHERE membership_id=mid;
   UPDATE staff_private.passkey_challenges ch SET finished_at=COALESCE(finished_at,clock_timestamp())
   FROM staff_private.sessions ss WHERE ch.session_id=ss.id AND ss.membership_id=mid;
   INSERT INTO public.audit_log(organization_id,actor_user_id,actor_membership_id,action,entity_type,entity_id)
   VALUES(target_org,m.user_id,mid,'staff.passkey_replaced','staff_session',s.id);
   RETURN jsonb_build_object('ok',true,'loginRequired',true);
  END IF;
  UPDATE staff_private.sessions SET passkey_verified_until=LEAST(expires_at,clock_timestamp()+interval '5 minutes') WHERE id=s.id;
  INSERT INTO public.audit_log(organization_id,actor_user_id,actor_membership_id,action,entity_type,entity_id)
  VALUES(target_org,m.user_id,mid,CASE WHEN q.purpose='register' THEN 'staff.passkey_registered' ELSE 'staff.passkey_verified' END,'staff_session',s.id);
  RETURN jsonb_build_object('ok',true);
 END IF;
 RETURN NULL;
END $fn$;
REVOKE ALL ON FUNCTION app.staff_mfa(uuid,text,text,jsonb) FROM PUBLIC;
COMMIT;
