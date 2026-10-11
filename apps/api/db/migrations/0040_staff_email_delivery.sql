BEGIN;

-- A mail transport receipt is not evidence of account ownership. The matching
-- recipient-bound token must also be consumed by the existing password flow.
ALTER TABLE staff_private.activation_tokens ADD COLUMN recipient_email text;
ALTER TABLE staff_private.activation_tokens ADD COLUMN mail_required boolean NOT NULL DEFAULT false;
UPDATE staff_private.activation_tokens t SET recipient_email=lower(btrim(u.email))
FROM public.organization_memberships m JOIN public.users u ON u.id=m.user_id WHERE t.membership_id=m.id;
ALTER TABLE staff_private.credentials ADD COLUMN verified_email text;
ALTER TABLE staff_private.credentials ADD COLUMN email_verified_at timestamptz;
ALTER TABLE staff_private.credentials ADD CONSTRAINT staff_verified_pair CHECK((verified_email IS NULL)=(email_verified_at IS NULL));
-- Legacy 'email' labels have no delivery evidence; do not grandfather them in.
UPDATE staff_private.credentials SET enabled=false WHERE verification_channel='email';

CREATE TABLE staff_private.mail_jobs (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 membership_id uuid NOT NULL REFERENCES public.organization_memberships(id),
 request_id uuid NOT NULL,
 purpose text NOT NULL CHECK(purpose IN ('invite','reset')),
 recipient_email text NOT NULL CHECK(length(recipient_email) BETWEEN 5 AND 254 AND recipient_email !~ '[\r\n]'),
 token_hash text NOT NULL UNIQUE REFERENCES staff_private.activation_tokens(token_hash),
 token_nonce text NOT NULL CHECK(token_nonce ~ '^[a-f0-9]{64}$'),
 key_id text NOT NULL CHECK(key_id ~ '^[a-z0-9_-]{1,32}$'),
 transport text NOT NULL CHECK(transport IN ('capture','smtp')),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','processing','accepted','uncertain','cancelled','failed')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 lease_id uuid,
 lease_until timestamptz,
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 last_code text,
 accepted_at timestamptz,
 consumed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,request_id),
 CHECK((state='processing')=(lease_id IS NOT NULL AND lease_until IS NOT NULL)),
 CHECK(last_code IS NULL OR last_code ~ '^[A-Z][A-Z0-9_]{0,63}$')
);
CREATE INDEX staff_mail_due ON staff_private.mail_jobs(organization_id,next_attempt_at,created_at) WHERE state='pending';
CREATE INDEX staff_mail_member ON staff_private.mail_jobs(membership_id,created_at);
CREATE SCHEMA staff_mail_ops;
REVOKE ALL ON SCHEMA staff_mail_ops FROM PUBLIC;

-- Operator-only, same trust boundary as invitation issuance in Stage 7.25.
-- NO raw token or key is persisted. A keyed HMAC over the immutable job binding
-- regenerates the bearer token at dispatch; its SHA-256 hash is checked again.
CREATE FUNCTION staff_private.enqueue_mail(target_org uuid,target_member uuid,target_request uuid,target_job uuid,
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
 IF u.status<>'active' OR role_code NOT IN ('front_desk','housekeeper','technician','concierge') THEN RAISE EXCEPTION 'STAFF_MAIL_ROLE_DENIED'; END IF;
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
REVOKE ALL ON FUNCTION staff_private.enqueue_mail(uuid,uuid,uuid,uuid,text,text,text,text,text,text) FROM PUBLIC;

-- No blind redelivery after a worker disappears: SMTP may have accepted mail.
CREATE FUNCTION staff_mail_ops.claim(target_org uuid,target_transport text)
RETURNS SETOF staff_private.mail_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE candidate uuid;
BEGIN
 IF target_org IS NULL OR target_transport IS NULL OR target_transport NOT IN ('capture','smtp') THEN RAISE EXCEPTION 'STAFF_MAIL_SCOPE_INVALID'; END IF;
 UPDATE staff_private.mail_jobs SET state='uncertain',lease_id=NULL,lease_until=NULL,last_code='LEASE_EXPIRED',updated_at=now()
 WHERE organization_id=target_org AND transport=target_transport AND state='processing' AND lease_until<=clock_timestamp();
 UPDATE staff_private.mail_jobs j SET state='cancelled',lease_id=NULL,lease_until=NULL,last_code='TOKEN_INACTIVE',updated_at=now()
 WHERE j.organization_id=target_org AND j.transport=target_transport AND j.state='pending' AND NOT EXISTS(
   SELECT 1 FROM staff_private.activation_tokens t JOIN public.organization_memberships m ON m.id=t.membership_id
   JOIN public.users u ON u.id=m.user_id WHERE t.token_hash=j.token_hash AND t.used_at IS NULL AND t.expires_at>now()
   AND m.organization_id=j.organization_id AND u.status='active' AND lower(btrim(u.email))=j.recipient_email
   AND ((j.purpose='invite' AND m.status='invited') OR (j.purpose='reset' AND m.status='active')));
 SELECT j.id INTO candidate FROM staff_private.mail_jobs j
 WHERE j.organization_id=target_org AND j.transport=target_transport AND j.state='pending' AND j.next_attempt_at<=now()
 ORDER BY j.created_at,j.id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF candidate IS NULL THEN RETURN; END IF;
 RETURN QUERY UPDATE staff_private.mail_jobs SET state='processing',attempts=attempts+1,lease_id=gen_random_uuid(),
 lease_until=clock_timestamp()+interval '2 minutes',updated_at=now() WHERE id=candidate RETURNING *;
END $fn$;

CREATE FUNCTION staff_mail_ops.ready(target_org uuid,target_job uuid,target_lease uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
 SELECT EXISTS(SELECT 1 FROM staff_private.mail_jobs j JOIN staff_private.activation_tokens t ON t.token_hash=j.token_hash
 JOIN public.organization_memberships m ON m.id=j.membership_id JOIN public.users u ON u.id=m.user_id
 WHERE j.id=target_job AND j.organization_id=target_org AND j.state='processing' AND j.lease_id=target_lease AND j.lease_until>clock_timestamp()
 AND t.used_at IS NULL AND t.expires_at>now() AND lower(btrim(u.email))=j.recipient_email AND u.status='active'
 AND ((j.purpose='invite' AND m.status='invited') OR (j.purpose='reset' AND m.status='active')))
$fn$;

CREATE FUNCTION staff_mail_ops.finish(target_org uuid,target_job uuid,target_lease uuid,target_outcome text,target_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE j staff_private.mail_jobs%ROWTYPE; new_state text;
BEGIN
 IF target_outcome IS NULL OR target_outcome NOT IN ('accepted','uncertain','retry','failed','cancelled')
 OR target_code IS NULL OR target_code !~ '^[A-Z][A-Z0-9_]{0,63}$' THEN RAISE EXCEPTION 'STAFF_MAIL_RESULT_INVALID'; END IF;
 SELECT * INTO j FROM staff_private.mail_jobs WHERE id=target_job AND organization_id=target_org
 AND state='processing' AND lease_id=target_lease AND lease_until>clock_timestamp() FOR UPDATE;
 IF j.id IS NULL THEN RETURN false; END IF;
 new_state:=CASE WHEN target_outcome='retry' THEN CASE WHEN j.attempts<3 THEN 'pending' ELSE 'failed' END ELSE target_outcome END;
 UPDATE staff_private.mail_jobs SET state=new_state,lease_id=NULL,lease_until=NULL,last_code=target_code,updated_at=now(),
 accepted_at=CASE WHEN new_state='accepted' THEN now() ELSE accepted_at END,
 next_attempt_at=CASE WHEN new_state='pending' THEN now()+make_interval(secs=>30*j.attempts) ELSE next_attempt_at END WHERE id=j.id;
 INSERT INTO public.audit_log(organization_id,actor_membership_id,action,entity_type,entity_id,after_state)
 VALUES(j.organization_id,j.membership_id,'staff.mail_result','staff_mail',j.id,jsonb_build_object('state',new_state,'code',target_code,'attempt',j.attempts));
 RETURN true;
END $fn$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA staff_mail_ops FROM PUBLIC;
REVOKE ALL ON TABLE staff_private.mail_jobs FROM PUBLIC;

-- recipient_email snapshot is also mandatory for legacy LOCAL invitations.
CREATE FUNCTION staff_private.bind_activation_recipient() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE address text;
BEGIN
 SELECT lower(btrim(u.email)) INTO address FROM public.organization_memberships m JOIN public.users u ON u.id=m.user_id WHERE m.id=NEW.membership_id;
 IF NEW.recipient_email IS NULL THEN NEW.recipient_email:=address; END IF;
 IF NEW.recipient_email IS DISTINCT FROM address THEN RAISE EXCEPTION 'STAFF_TOKEN_RECIPIENT_MISMATCH'; END IF;
 IF NEW.verification_channel='email' AND NOT NEW.mail_required THEN RAISE EXCEPTION 'STAFF_EMAIL_DELIVERY_REQUIRED'; END IF;
 RETURN NEW;
END $fn$;
CREATE TRIGGER staff_activation_recipient BEFORE INSERT ON staff_private.activation_tokens
FOR EACH ROW EXECUTE FUNCTION staff_private.bind_activation_recipient();
REVOKE ALL ON FUNCTION staff_private.bind_activation_recipient() FROM PUBLIC;

-- A changed email is a changed recovery identity; old mail/tokens/sessions may
-- not be applied to the new address. No self-service email change is introduced.
CREATE FUNCTION staff_private.revoke_changed_email() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 IF lower(btrim(NEW.email)) IS DISTINCT FROM lower(btrim(OLD.email)) THEN
 UPDATE staff_private.activation_tokens t SET used_at=now() FROM public.organization_memberships m WHERE m.user_id=NEW.id AND t.membership_id=m.id AND t.used_at IS NULL;
 UPDATE staff_private.mail_jobs j SET state='cancelled',lease_id=NULL,lease_until=NULL,last_code='EMAIL_CHANGED',updated_at=now()
 FROM public.organization_memberships m WHERE m.user_id=NEW.id AND j.membership_id=m.id AND j.state IN ('pending','processing','accepted','uncertain');
 UPDATE staff_private.credentials c SET verified_email=NULL,email_verified_at=NULL,enabled=false,version=version+1
 FROM public.organization_memberships m WHERE m.user_id=NEW.id AND c.membership_id=m.id;
 UPDATE staff_private.sessions s SET revoked_at=now() FROM public.organization_memberships m WHERE m.user_id=NEW.id AND s.membership_id=m.id AND s.revoked_at IS NULL;
 END IF;
 RETURN NEW;
END $fn$;
CREATE TRIGGER staff_email_identity_change AFTER UPDATE OF email ON public.users
FOR EACH ROW EXECUTE FUNCTION staff_private.revoke_changed_email();
REVOKE ALL ON FUNCTION staff_private.revoke_changed_email() FROM PUBLIC;

-- Runtime accept/resolve replacements are appended below before COMMIT.

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
 OR role_code NOT IN ('front_desk','housekeeper','technician','concierge') THEN RETURN false; END IF;
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

CREATE OR REPLACE FUNCTION app.staff_auth_resolve(target_hash text)
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
 s.expires_at,c.version,CASE WHEN c.verified_email=lower(btrim(u.email)) AND c.email_verified_at IS NOT NULL THEN 'email' ELSE 'local_fixture' END
 FROM public.users u JOIN public.roles r ON r.id=m.role_id WHERE u.id=m.user_id;
END $fn$;
COMMIT;
