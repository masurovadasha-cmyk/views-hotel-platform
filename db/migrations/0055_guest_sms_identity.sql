BEGIN;
CREATE SCHEMA guest_identity_private;
REVOKE ALL ON SCHEMA guest_identity_private FROM PUBLIC;
CREATE TABLE guest_identity_private.sms_challenges (
 id uuid PRIMARY KEY,
 phone_e164 text NOT NULL CHECK(phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
 otp_digest char(64) NOT NULL CHECK(otp_digest ~ '^[a-f0-9]{64}$'),
 locale text NOT NULL CHECK(locale IN ('ru','uz','en')),
 delivery_status text NOT NULL DEFAULT 'pending' CHECK(delivery_status IN ('pending','delivered','uncertain','superseded')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX guest_sms_phone_recent_idx ON guest_identity_private.sms_challenges(phone_e164,created_at DESC);
CREATE INDEX guest_sms_expiry_idx ON guest_identity_private.sms_challenges(expires_at);
CREATE TABLE guest_identity_private.sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES public.users(id),
 token_hash char(64) NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz
);
CREATE INDEX guest_identity_sessions_user_idx ON guest_identity_private.sessions(user_id,expires_at);
REVOKE ALL ON ALL TABLES IN SCHEMA guest_identity_private FROM PUBLIC;

CREATE FUNCTION app.issue_guest_sms_challenge(challenge uuid,phone text,digest text,language text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('guest-sms:'||phone,0));
 IF EXISTS(SELECT 1 FROM guest_identity_private.sms_challenges WHERE phone_e164=phone AND created_at>clock_timestamp()-interval '60 seconds') THEN RETURN false; END IF;
 UPDATE guest_identity_private.sms_challenges SET delivery_status='superseded' WHERE phone_e164=phone AND consumed_at IS NULL AND delivery_status IN ('pending','delivered');
 INSERT INTO guest_identity_private.sms_challenges(id,phone_e164,otp_digest,locale,expires_at)
 VALUES(challenge,phone,digest,language,clock_timestamp()+interval '5 minutes');
 RETURN true;
END $$;
CREATE FUNCTION app.mark_guest_sms_delivery(challenge uuid,delivered boolean)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 UPDATE guest_identity_private.sms_challenges SET delivery_status=CASE WHEN delivered THEN 'delivered' ELSE 'uncertain' END
 WHERE id=challenge AND delivery_status='pending' AND consumed_at IS NULL
$$;
CREATE FUNCTION app.exchange_guest_sms_code(challenge uuid,digest text,session_hash text)
RETURNS TABLE(outcome text,guest_user_id uuid,session_expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c guest_identity_private.sms_challenges; guest_id uuid; expiry timestamptz;
BEGIN
 IF digest IS NULL OR digest !~ '^[a-f0-9]{64}$' OR session_hash IS NULL OR session_hash !~ '^[a-f0-9]{64}$' THEN
  RETURN QUERY SELECT 'invalid'::text,NULL::uuid,NULL::timestamptz; RETURN;
 END IF;
 SELECT * INTO c FROM guest_identity_private.sms_challenges WHERE id=challenge FOR UPDATE;
 IF c.id IS NULL OR c.delivery_status<>'delivered' OR c.consumed_at IS NOT NULL OR c.expires_at<=clock_timestamp() OR c.attempts>=5 THEN
  RETURN QUERY SELECT 'invalid'::text,NULL::uuid,NULL::timestamptz; RETURN;
 END IF;
 UPDATE guest_identity_private.sms_challenges SET attempts=attempts+1 WHERE id=challenge;
 IF c.otp_digest<>digest THEN RETURN QUERY SELECT 'invalid'::text,NULL::uuid,NULL::timestamptz; RETURN; END IF;
 INSERT INTO public.users(phone_e164,locale) VALUES(c.phone_e164,c.locale) ON CONFLICT(phone_e164) WHERE phone_e164 IS NOT NULL DO NOTHING;
 SELECT id INTO guest_id FROM public.users WHERE phone_e164=c.phone_e164 AND status='active' FOR SHARE;
 IF guest_id IS NULL THEN RETURN QUERY SELECT 'invalid'::text,NULL::uuid,NULL::timestamptz; RETURN; END IF;
 expiry:=clock_timestamp()+interval '7 days';
 INSERT INTO guest_identity_private.sessions(user_id,token_hash,expires_at) VALUES(guest_id,session_hash,expiry);
 UPDATE guest_identity_private.sms_challenges SET consumed_at=clock_timestamp() WHERE id=challenge;
 RETURN QUERY SELECT 'verified'::text,guest_id,expiry;
END $$;
CREATE FUNCTION app.resolve_guest_identity(session_hash text)
RETURNS TABLE(guest_user_id uuid,guest_locale text,session_expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT u.id,u.locale,s.expires_at FROM guest_identity_private.sessions s JOIN public.users u ON u.id=s.user_id
 WHERE s.token_hash=session_hash AND s.revoked_at IS NULL AND s.expires_at>now() AND u.status='active'
$$;
CREATE FUNCTION app.revoke_guest_identity(session_hash text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 UPDATE guest_identity_private.sessions SET revoked_at=clock_timestamp() WHERE token_hash=session_hash AND revoked_at IS NULL
$$;
REVOKE ALL ON FUNCTION app.issue_guest_sms_challenge(uuid,text,text,text),app.mark_guest_sms_delivery(uuid,boolean),
 app.exchange_guest_sms_code(uuid,text,text),app.resolve_guest_identity(text),app.revoke_guest_identity(text) FROM PUBLIC;
COMMIT;
