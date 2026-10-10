BEGIN;
-- Authentication records have no tenant owner: the verified identity remains a
-- guest. Private schema + narrowly granted functions, never membership writes.
CREATE TABLE guest_identity_private.email_challenges (
 id uuid PRIMARY KEY,
 email text NOT NULL CHECK(email=lower(email) AND length(email)<=254 AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 token_digest char(64) NOT NULL CHECK(token_digest ~ '^[a-f0-9]{64}$'),
 locale text NOT NULL CHECK(locale IN ('ru','uz','en')),
 delivery_status text NOT NULL DEFAULT 'pending' CHECK(delivery_status IN ('pending','accepted','uncertain','superseded')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX guest_email_recent_idx ON guest_identity_private.email_challenges(email,created_at DESC);
CREATE INDEX guest_email_expiry_idx ON guest_identity_private.email_challenges(expires_at);
CREATE TABLE guest_identity_private.email_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES public.users(id),
 verified_email text NOT NULL,
 token_hash char(64) NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz
);
CREATE INDEX guest_email_sessions_user_idx ON guest_identity_private.email_sessions(user_id,expires_at);
CREATE INDEX guest_email_sessions_expiry_idx ON guest_identity_private.email_sessions(expires_at);
REVOKE ALL ON guest_identity_private.email_challenges,guest_identity_private.email_sessions FROM PUBLIC;

CREATE FUNCTION app.issue_guest_email_challenge(challenge uuid,address text,digest text,language text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('guest-email:'||address,0));
 IF EXISTS(SELECT 1 FROM guest_identity_private.email_challenges WHERE email=address AND created_at>clock_timestamp()-interval '60 seconds') THEN RETURN false; END IF;
 UPDATE guest_identity_private.email_challenges SET delivery_status='superseded'
 WHERE email=address AND consumed_at IS NULL AND delivery_status IN ('pending','accepted');
 INSERT INTO guest_identity_private.email_challenges(id,email,token_digest,locale,expires_at)
 VALUES(challenge,address,digest,language,clock_timestamp()+interval '15 minutes');
 RETURN true;
END $$;
CREATE FUNCTION app.mark_guest_email_delivery(challenge uuid,accepted boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE changed integer;
BEGIN
 UPDATE guest_identity_private.email_challenges SET delivery_status=CASE WHEN accepted THEN 'accepted' ELSE 'uncertain' END
 WHERE id=challenge AND delivery_status='pending' AND consumed_at IS NULL AND expires_at>clock_timestamp();
 GET DIAGNOSTICS changed=ROW_COUNT;
 RETURN changed=1;
END $$;
CREATE FUNCTION app.exchange_guest_email_token(challenge uuid,digest text,session_hash text)
RETURNS TABLE(outcome text,guest_user_id uuid,session_expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c guest_identity_private.email_challenges; guest_id uuid; expiry timestamptz;
BEGIN
 IF digest IS NULL OR digest !~ '^[a-f0-9]{64}$' OR session_hash IS NULL OR session_hash !~ '^[a-f0-9]{64}$' THEN
  RETURN QUERY SELECT 'invalid'::text,NULL::uuid,NULL::timestamptz; RETURN;
 END IF;
 SELECT * INTO c FROM guest_identity_private.email_challenges WHERE id=challenge FOR UPDATE;
 IF c.id IS NULL OR c.delivery_status<>'accepted' OR c.consumed_at IS NOT NULL OR c.expires_at<=clock_timestamp() OR c.attempts>=5 THEN
  RETURN QUERY SELECT 'invalid'::text,NULL::uuid,NULL::timestamptz; RETURN;
 END IF;
 UPDATE guest_identity_private.email_challenges SET attempts=attempts+1 WHERE id=challenge;
 IF c.token_digest<>digest THEN RETURN QUERY SELECT 'invalid'::text,NULL::uuid,NULL::timestamptz; RETURN; END IF;
 INSERT INTO public.users(email,locale) VALUES(c.email,c.locale)
 ON CONFLICT(lower(email)) WHERE email IS NOT NULL DO NOTHING;
 SELECT id INTO guest_id FROM public.users WHERE lower(email)=c.email AND status='active' FOR SHARE;
 IF guest_id IS NULL THEN RETURN QUERY SELECT 'invalid'::text,NULL::uuid,NULL::timestamptz; RETURN; END IF;
 expiry:=clock_timestamp()+interval '7 days';
 INSERT INTO guest_identity_private.email_sessions(user_id,verified_email,token_hash,expires_at)
 VALUES(guest_id,c.email,session_hash,expiry);
 UPDATE guest_identity_private.email_challenges SET consumed_at=clock_timestamp() WHERE id=challenge;
 RETURN QUERY SELECT 'verified'::text,guest_id,expiry;
END $$;
CREATE FUNCTION app.resolve_guest_email_identity(session_hash text)
RETURNS TABLE(guest_user_id uuid,guest_email text,guest_locale text,session_expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT u.id,s.verified_email,u.locale,s.expires_at
 FROM guest_identity_private.email_sessions s JOIN public.users u ON u.id=s.user_id
 WHERE s.token_hash=session_hash AND s.revoked_at IS NULL AND s.expires_at>now()
 AND u.status='active' AND lower(u.email)=s.verified_email
$$;
CREATE FUNCTION app.revoke_guest_email_identity(session_hash text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 UPDATE guest_identity_private.email_sessions SET revoked_at=clock_timestamp()
 WHERE token_hash=session_hash AND revoked_at IS NULL
$$;
REVOKE ALL ON FUNCTION app.issue_guest_email_challenge(uuid,text,text,text),app.mark_guest_email_delivery(uuid,boolean),
 app.exchange_guest_email_token(uuid,text,text),app.resolve_guest_email_identity(text),app.revoke_guest_email_identity(text) FROM PUBLIC;
COMMIT;
