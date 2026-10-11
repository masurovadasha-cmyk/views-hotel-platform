BEGIN;
-- Only extend the local nonprivileged staff pilot to the two dedicated supply roles.
-- Existing memberships, credentials, delivery proof, grants and function ACLs remain unchanged.
-- Full latest definitions preserve recovery/assurance fixes in 0040–0044.

-- Latest definition: 0039_staff_password_sessions.sql
CREATE OR REPLACE FUNCTION staff_private.issue_token(target_membership uuid,target_purpose text,target_hash text,target_channel text)
RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
DECLARE m public.organization_memberships%ROWTYPE; v integer; role_code text;
BEGIN
  IF target_purpose IS NULL OR target_purpose NOT IN ('invite','reset') OR target_hash IS NULL OR target_hash !~ '^[a-f0-9]{64}$'
     OR target_channel IS NULL OR target_channel NOT IN ('email','local_fixture') THEN RAISE EXCEPTION 'STAFF_TOKEN_CONFIG_INVALID'; END IF;
  SELECT * INTO m FROM public.organization_memberships WHERE id=target_membership FOR UPDATE;
  SELECT code INTO role_code FROM public.roles WHERE id=m.role_id;
  IF m.id IS NULL OR role_code NOT IN ('front_desk','housekeeper','technician','concierge','procurement','warehouse') THEN RAISE EXCEPTION 'STAFF_PILOT_ROLE_DENIED'; END IF;
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

-- Latest definition: 0039_staff_password_sessions.sql
CREATE OR REPLACE FUNCTION app.staff_auth_lookup(target_org uuid,target_email text)
RETURNS TABLE(membership_id uuid,password_hash text,version integer)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
 SELECT c.membership_id,c.password_hash,c.version FROM staff_private.credentials c
 JOIN public.organization_memberships m ON m.id=c.membership_id
 JOIN public.users u ON u.id=m.user_id JOIN public.roles r ON r.id=m.role_id
 WHERE m.organization_id=target_org AND lower(u.email)=target_email AND u.status='active'
   AND m.status='active' AND c.enabled AND r.code IN ('front_desk','housekeeper','technician','concierge','procurement','warehouse') LIMIT 2
$fn$;

-- Latest definition: 0039_staff_password_sessions.sql
CREATE OR REPLACE FUNCTION app.staff_auth_start(target_member uuid,target_version integer,target_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE m public.organization_memberships%ROWTYPE; c staff_private.credentials%ROWTYPE; sid uuid;
BEGIN
 IF target_hash IS NULL OR target_hash !~ '^[a-f0-9]{64}$' OR target_version IS NULL THEN RETURN false; END IF;
 SELECT * INTO m FROM public.organization_memberships WHERE id=target_member FOR UPDATE;
 SELECT * INTO c FROM staff_private.credentials WHERE membership_id=m.id FOR UPDATE;
 IF c.membership_id IS NULL OR NOT c.enabled OR c.version<>target_version OR m.status<>'active'
 OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=m.user_id AND status='active')
 OR NOT EXISTS(SELECT 1 FROM public.roles WHERE id=m.role_id AND code IN ('front_desk','housekeeper','technician','concierge','procurement','warehouse')) THEN RETURN false; END IF;
 INSERT INTO staff_private.sessions(token_hash,membership_id,credential_version,role_id)
 VALUES(target_hash,m.id,c.version,m.role_id) RETURNING id INTO sid;
 UPDATE staff_private.sessions SET revoked_at=now() WHERE id IN (
   SELECT id FROM staff_private.sessions WHERE membership_id=m.id AND revoked_at IS NULL ORDER BY created_at DESC,id DESC OFFSET 5
 );
 INSERT INTO public.audit_log(organization_id,actor_user_id,actor_membership_id,action,entity_type,entity_id)
 VALUES(m.organization_id,m.user_id,m.id,'staff.login','staff_session',sid);
 RETURN true;
END $fn$;

-- Latest definition: 0040_staff_email_delivery.sql
CREATE OR REPLACE FUNCTION staff_private.enqueue_mail(target_org uuid,target_member uuid,target_request uuid,target_job uuid,
 target_purpose text,target_email text,target_hash text,target_nonce text,target_key_id text,target_transport text)
RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
DECLARE m public.organization_memberships%ROWTYPE; u public.users%ROWTYPE; c staff_private.credentials%ROWTYPE;
 prior staff_private.mail_jobs%ROWTYPE; role_code text;
BEGIN
 IF target_org IS NULL OR target_member IS NULL OR target_job IS NULL OR target_request IS NULL
 OR target_purpose IS NULL OR target_purpose NOT IN ('invite','reset') OR target_transport IS NULL OR target_transport NOT IN ('capture','smtp')
 OR target_hash IS NULL OR target_hash !~ '^[a-f0-9]{64}$' OR target_nonce IS NULL OR target_nonce !~ '^[a-f0-9]{64}$'
 OR target_key_id IS NULL OR target_key_id !~ '^[a-z0-9_-]{1,32}$' THEN RAISE EXCEPTION 'STAFF_MAIL_CONFIG_INVALID'; END IF;
 SELECT * INTO m FROM public.organization_memberships WHERE id=target_member AND organization_id=target_org FOR UPDATE;
 IF m.id IS NULL THEN RAISE EXCEPTION 'STAFF_MAIL_MEMBER_INVALID'; END IF;
 SELECT * INTO u FROM public.users WHERE id=m.user_id;
 SELECT code INTO role_code FROM public.roles WHERE id=m.role_id;
 IF u.status<>'active' OR role_code NOT IN ('front_desk','housekeeper','technician','concierge','procurement','warehouse') THEN RAISE EXCEPTION 'STAFF_MAIL_ROLE_DENIED'; END IF;
 IF target_email IS NULL OR target_email<>lower(btrim(u.email)) OR target_email !~ '^[A-Za-z0-9.!#$%&*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}$'
 THEN RAISE EXCEPTION 'STAFF_MAIL_RECIPIENT_MISMATCH'; END IF;
 IF target_transport='capture' AND target_email NOT LIKE '%@views.invalid' THEN RAISE EXCEPTION 'STAFF_MAIL_CAPTURE_FIXTURE_ONLY'; END IF;
 SELECT * INTO prior FROM staff_private.mail_jobs WHERE organization_id=target_org AND request_id=target_request;
 IF prior.id IS NOT NULL THEN
   IF prior.membership_id<>m.id OR prior.purpose<>target_purpose OR prior.recipient_email<>target_email OR prior.transport<>target_transport
   THEN RAISE EXCEPTION 'STAFF_MAIL_IDEMPOTENCY_MISMATCH'; END IF;
   RETURN prior.id;
 END IF;
 SELECT * INTO c FROM staff_private.credentials WHERE membership_id=m.id FOR UPDATE;
 IF (target_purpose='invite' AND (c.membership_id IS NOT NULL OR m.status<>'invited'))
 OR (target_purpose='reset' AND (c.membership_id IS NULL OR m.status<>'active')) THEN RAISE EXCEPTION 'STAFF_MAIL_STATE_INVALID'; END IF;
 -- Rate-limit issuance per member, not just per fresh idempotency key.
 IF (SELECT count(*) FROM staff_private.mail_jobs WHERE membership_id=m.id AND created_at>now()-interval '1 hour')>=5
 THEN RAISE EXCEPTION 'STAFF_MAIL_ISSUE_RATE_LIMIT'; END IF;
 UPDATE staff_private.activation_tokens SET used_at=now() WHERE membership_id=m.id AND purpose=target_purpose AND used_at IS NULL;
 UPDATE staff_private.mail_jobs SET state='cancelled',lease_id=NULL,lease_until=NULL,updated_at=now(),last_code='SUPERSEDED'
 WHERE membership_id=m.id AND purpose=target_purpose AND state IN ('pending','processing','accepted','uncertain');
 INSERT INTO staff_private.activation_tokens(token_hash,membership_id,purpose,expected_version,verification_channel,expires_at,recipient_email,mail_required)
 VALUES(target_hash,m.id,target_purpose,c.version,CASE WHEN target_transport='smtp' THEN 'email' ELSE 'local_fixture' END,
 now()+CASE WHEN target_purpose='reset' THEN interval '30 minutes' ELSE interval '24 hours' END,target_email,true);
 INSERT INTO staff_private.mail_jobs(id,organization_id,membership_id,request_id,purpose,recipient_email,token_hash,token_nonce,key_id,transport)
 VALUES(target_job,target_org,m.id,target_request,target_purpose,target_email,target_hash,target_nonce,target_key_id,target_transport);
 INSERT INTO public.audit_log(organization_id,actor_membership_id,action,entity_type,entity_id,after_state)
 VALUES(target_org,m.id,'staff.mail_queued','staff_mail',target_job,jsonb_build_object('purpose',target_purpose,'transport',target_transport));
 RETURN target_job;
END $fn$;

-- Latest definition: 0040_staff_email_delivery.sql
CREATE OR REPLACE FUNCTION app.staff_auth_accept(target_org uuid,target_hash text,target_purpose text,target_password_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE t staff_private.activation_tokens%ROWTYPE; m public.organization_memberships%ROWTYPE; j staff_private.mail_jobs%ROWTYPE;
 v integer; role_code text; address text; is_verified boolean:=false;
BEGIN
 IF target_org IS NULL OR target_hash IS NULL OR target_hash !~ '^[a-f0-9]{64}$' OR target_purpose IS NULL OR target_purpose NOT IN ('invite','reset')
 OR target_password_hash IS NULL OR target_password_hash !~ '^scrypt-v1\$131072\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$' THEN RETURN false; END IF;
 SELECT * INTO t FROM staff_private.activation_tokens WHERE token_hash=target_hash;
 IF t.membership_id IS NULL THEN RETURN false; END IF;
 SELECT * INTO m FROM public.organization_memberships WHERE id=t.membership_id AND organization_id=target_org FOR UPDATE;
 IF m.id IS NULL THEN RETURN false; END IF;
 SELECT lower(btrim(email)) INTO address FROM public.users WHERE id=m.user_id AND status='active';
 IF address IS NULL THEN RETURN false; END IF;
 SELECT version INTO v FROM staff_private.credentials WHERE membership_id=m.id FOR UPDATE;
 SELECT * INTO t FROM staff_private.activation_tokens WHERE token_hash=target_hash FOR UPDATE;
 SELECT code INTO role_code FROM public.roles WHERE id=m.role_id;
 IF t.used_at IS NOT NULL OR t.expires_at<=now() OR t.purpose<>target_purpose OR t.recipient_email IS DISTINCT FROM address
 OR role_code NOT IN ('front_desk','housekeeper','technician','concierge','procurement','warehouse') THEN RETURN false; END IF;
 IF t.mail_required THEN
   SELECT * INTO j FROM staff_private.mail_jobs WHERE token_hash=t.token_hash FOR UPDATE;
   IF j.id IS NULL OR j.organization_id<>target_org OR j.membership_id<>m.id OR j.recipient_email<>address
   OR j.state NOT IN ('accepted','uncertain') THEN RETURN false; END IF;
   is_verified:=j.transport='smtp' AND t.verification_channel='email';
 ELSIF t.verification_channel<>'local_fixture' THEN RETURN false;
 END IF;
 IF target_purpose='invite' THEN
   IF m.status<>'invited' OR v IS NOT NULL THEN RETURN false; END IF;
   INSERT INTO staff_private.credentials(membership_id,password_hash,verification_channel,verified_email,email_verified_at)
   VALUES(m.id,target_password_hash,CASE WHEN is_verified THEN 'email' ELSE 'local_fixture' END,
     CASE WHEN is_verified THEN address ELSE NULL END,CASE WHEN is_verified THEN now() ELSE NULL END);
   UPDATE public.organization_memberships SET status='active',joined_at=COALESCE(joined_at,now()) WHERE id=m.id;
 ELSE
   IF m.status<>'active' OR v IS NULL OR v<>t.expected_version THEN RETURN false; END IF;
   UPDATE staff_private.credentials SET password_hash=target_password_hash,version=version+1,enabled=true,changed_at=now(),
     verification_channel=CASE WHEN is_verified THEN 'email' ELSE 'local_fixture' END,
     verified_email=CASE WHEN is_verified THEN address ELSE NULL END,email_verified_at=CASE WHEN is_verified THEN now() ELSE NULL END
   WHERE membership_id=m.id;
 END IF;
 UPDATE staff_private.activation_tokens SET used_at=now() WHERE membership_id=m.id AND used_at IS NULL;
 UPDATE staff_private.sessions SET revoked_at=now() WHERE membership_id=m.id AND revoked_at IS NULL;
 IF j.id IS NOT NULL THEN UPDATE staff_private.mail_jobs SET consumed_at=now(),updated_at=now() WHERE id=j.id; END IF;
 UPDATE staff_private.mail_jobs SET state='cancelled',lease_id=NULL,lease_until=NULL,last_code='TOKEN_CONSUMED',updated_at=now()
 WHERE membership_id=m.id AND state IN ('pending','processing') AND id IS DISTINCT FROM j.id;
 INSERT INTO public.audit_log(organization_id,actor_user_id,actor_membership_id,action,entity_type,entity_id,after_state)
 VALUES(m.organization_id,m.user_id,m.id,CASE WHEN target_purpose='invite' THEN 'staff.invitation_accepted' ELSE 'staff.password_reset' END,
 'membership',m.id,jsonb_build_object('emailVerified',is_verified,'mailProof',j.id IS NOT NULL));
 RETURN true;
END $fn$;

-- Latest definition: 0041_staff_mail_revocation_leases.sql
CREATE OR REPLACE FUNCTION staff_private.mail_context_valid(job staff_private.mail_jobs)
RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog AS $fn$
 SELECT EXISTS(
  SELECT 1 FROM staff_private.activation_tokens t
  JOIN public.organization_memberships m ON m.id=t.membership_id
  JOIN public.users u ON u.id=m.user_id
  JOIN public.roles r ON r.id=m.role_id
  LEFT JOIN staff_private.credentials c ON c.membership_id=m.id
  WHERE t.token_hash=(job).token_hash AND t.mail_required AND t.used_at IS NULL AND t.expires_at>now()
  AND m.id=(job).membership_id AND m.organization_id=(job).organization_id
  AND t.purpose=(job).purpose AND t.recipient_email=(job).recipient_email
  AND lower(btrim(u.email))=(job).recipient_email AND u.status='active'
  AND r.code IN ('front_desk','housekeeper','technician','concierge','procurement','warehouse')
  AND (((job).purpose='invite' AND m.status='invited' AND c.membership_id IS NULL AND t.expected_version IS NULL)
    OR ((job).purpose='reset' AND m.status='active' AND c.version=t.expected_version))
 )
$fn$;

-- Latest definition: 0043_staff_passkey_recovery.sql
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
 OR NOT EXISTS(SELECT 1 FROM public.roles WHERE id=m.role_id AND code IN ('front_desk','housekeeper','technician','concierge','procurement','warehouse')) THEN RETURN NULL; END IF;
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

-- Latest definition: 0044_staff_password_assurance.sql
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
 OR NOT EXISTS(SELECT 1 FROM public.roles WHERE id=m.role_id AND code IN ('front_desk','housekeeper','technician','concierge','procurement','warehouse'))
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
