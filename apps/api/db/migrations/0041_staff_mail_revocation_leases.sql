BEGIN;

-- 0040 is already applied on the owner's workstation. Keep its bytes immutable.
-- Revalidate the current identity/credential version before dispatching queued mail.
CREATE FUNCTION staff_private.mail_context_valid(job staff_private.mail_jobs)
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
  AND r.code IN ('front_desk','housekeeper','technician','concierge')
  AND (((job).purpose='invite' AND m.status='invited' AND c.membership_id IS NULL AND t.expected_version IS NULL)
    OR ((job).purpose='reset' AND m.status='active' AND c.version=t.expected_version))
 )
$fn$;
REVOKE ALL ON FUNCTION staff_private.mail_context_valid(staff_private.mail_jobs) FROM PUBLIC;

CREATE OR REPLACE FUNCTION staff_mail_ops.claim(target_org uuid,target_transport text)
RETURNS SETOF staff_private.mail_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE candidate uuid;
BEGIN
 IF target_org IS NULL OR target_transport IS NULL OR target_transport NOT IN ('capture','smtp') THEN RAISE EXCEPTION 'STAFF_MAIL_SCOPE_INVALID'; END IF;
 UPDATE staff_private.mail_jobs SET state='uncertain',lease_id=NULL,lease_until=NULL,last_code='LEASE_EXPIRED',updated_at=now()
 WHERE organization_id=target_org AND transport=target_transport AND state='processing' AND lease_until<=clock_timestamp();
 UPDATE staff_private.mail_jobs j SET state='cancelled',lease_id=NULL,lease_until=NULL,last_code='TOKEN_INACTIVE',updated_at=now()
 WHERE j.organization_id=target_org AND j.transport=target_transport AND j.state='pending'
 AND NOT staff_private.mail_context_valid(j);
 SELECT j.id INTO candidate FROM staff_private.mail_jobs j
 WHERE j.organization_id=target_org AND j.transport=target_transport AND j.state='pending' AND j.next_attempt_at<=now()
 ORDER BY j.created_at,j.id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF candidate IS NULL THEN RETURN; END IF;
 RETURN QUERY UPDATE staff_private.mail_jobs SET state='processing',attempts=attempts+1,lease_id=gen_random_uuid(),
 lease_until=clock_timestamp()+interval '2 minutes',updated_at=now() WHERE id=candidate RETURNING *;
END $fn$;

CREATE OR REPLACE FUNCTION staff_mail_ops.ready(target_org uuid,target_job uuid,target_lease uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
 SELECT EXISTS(SELECT 1 FROM staff_private.mail_jobs j
 WHERE j.id=target_job AND j.organization_id=target_org AND j.state='processing'
 AND j.lease_id=target_lease AND j.lease_until>clock_timestamp() AND staff_private.mail_context_valid(j))
$fn$;

CREATE OR REPLACE FUNCTION staff_mail_ops.finish(target_org uuid,target_job uuid,target_lease uuid,target_outcome text,target_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE j staff_private.mail_jobs%ROWTYPE; new_state text;
BEGIN
 IF target_outcome IS NULL OR target_outcome NOT IN ('accepted','uncertain','retry','failed','cancelled')
 OR target_code IS NULL OR target_code !~ '^[A-Z][A-Z0-9_]{0,63}$' THEN RAISE EXCEPTION 'STAFF_MAIL_RESULT_INVALID'; END IF;
 SELECT * INTO j FROM staff_private.mail_jobs WHERE id=target_job AND organization_id=target_org
 AND state='processing' AND lease_id=target_lease FOR UPDATE;
 -- The lease can expire while SELECT waits for an unchanged locked row.
 -- Evaluate the wall clock AFTER acquiring that lock, not only in its predicate.
 IF j.id IS NULL OR j.lease_until<=clock_timestamp() THEN RETURN false; END IF;
 new_state:=CASE WHEN target_outcome='retry' THEN CASE WHEN j.attempts<3 THEN 'pending' ELSE 'failed' END ELSE target_outcome END;
 UPDATE staff_private.mail_jobs SET state=new_state,lease_id=NULL,lease_until=NULL,last_code=target_code,updated_at=now(),
 accepted_at=CASE WHEN new_state='accepted' THEN now() ELSE accepted_at END,
 next_attempt_at=CASE WHEN new_state='pending' THEN now()+make_interval(secs=>30*j.attempts) ELSE next_attempt_at END WHERE id=j.id;
 INSERT INTO public.audit_log(organization_id,actor_membership_id,action,entity_type,entity_id,after_state)
 VALUES(j.organization_id,j.membership_id,'staff.mail_result','staff_mail',j.id,jsonb_build_object('state',new_state,'code',target_code,'attempt',j.attempts));
 RETURN true;
END $fn$;

-- Restoring an offboarded identity must not restore its old bearer links.
-- invited -> active is the legitimate acceptance transition and keeps its receipt.
CREATE OR REPLACE FUNCTION staff_private.revoke_membership_sessions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 IF NEW.status IS DISTINCT FROM OLD.status OR NEW.role_id IS DISTINCT FROM OLD.role_id THEN
  UPDATE staff_private.sessions SET revoked_at=now() WHERE membership_id=NEW.id AND revoked_at IS NULL;
  IF NEW.status<>'active' OR NEW.role_id IS DISTINCT FROM OLD.role_id THEN
   UPDATE staff_private.activation_tokens SET used_at=now() WHERE membership_id=NEW.id AND used_at IS NULL;
   UPDATE staff_private.mail_jobs SET state='cancelled',lease_id=NULL,lease_until=NULL,last_code='MEMBERSHIP_CHANGED',updated_at=now()
   WHERE membership_id=NEW.id AND consumed_at IS NULL AND state IN ('pending','processing','accepted','uncertain');
  END IF;
 END IF;
 RETURN NEW;
END $fn$;

CREATE OR REPLACE FUNCTION staff_private.revoke_user_sessions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 IF NEW.status IS DISTINCT FROM OLD.status THEN
  UPDATE staff_private.sessions s SET revoked_at=now() FROM public.organization_memberships m
  WHERE m.user_id=NEW.id AND s.membership_id=m.id AND s.revoked_at IS NULL;
  IF NEW.status<>'active' THEN
   UPDATE staff_private.activation_tokens t SET used_at=now() FROM public.organization_memberships m
   WHERE m.user_id=NEW.id AND t.membership_id=m.id AND t.used_at IS NULL;
   UPDATE staff_private.mail_jobs j SET state='cancelled',lease_id=NULL,lease_until=NULL,last_code='USER_DISABLED',updated_at=now()
   FROM public.organization_memberships m WHERE m.user_id=NEW.id AND j.membership_id=m.id
   AND j.consumed_at IS NULL AND j.state IN ('pending','processing','accepted','uncertain');
  END IF;
 END IF;
 RETURN NEW;
END $fn$;

COMMIT;
