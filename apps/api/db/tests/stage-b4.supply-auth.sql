-- Administrative assertions for a disposable DB only. Every synthetic row rolls back.
BEGIN;
DO $proof$
DECLARE org uuid:='10000000-0000-4000-8000-000000000001'; property uuid:='10000000-0000-4000-8000-000000000002';
 member uuid; person uuid; role_code text; address text; token text; session_hash text; job uuid; request_id uuid; claimed record; identity record;
 password_hash text:='scrypt-v1$131072$8$1$'||repeat('0',32)||'$'||repeat('0',128); expected text[];
BEGIN
 IF current_database()<>'views' OR shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') IS DISTINCT FROM 'VIEWS_DISPOSABLE_CORE_TEST' THEN RAISE EXCEPTION 'DISPOSABLE_DATABASE_REQUIRED'; END IF;
 FOREACH role_code IN ARRAY ARRAY['procurement','warehouse'] LOOP
  person:=gen_random_uuid(); member:=gen_random_uuid(); address:='supply-'||person::text||'@views.invalid'; token:=encode(public.digest(member::text,'sha256'),'hex'); session_hash:=encode(public.digest(person::text,'sha256'),'hex');
  INSERT INTO public.users(id,email,display_name,status) VALUES(person,address,'Synthetic supply auth','active');
  INSERT INTO public.organization_memberships(id,organization_id,user_id,role_id,status) SELECT member,org,person,id,'invited' FROM public.roles WHERE code=role_code;
  INSERT INTO public.membership_property_scopes(membership_id,property_id) VALUES(member,property);
  IF NOT staff_private.issue_token(member,'invite',token,'local_fixture') THEN RAISE EXCEPTION 'SUPPLY_ISSUE_FAILED'; END IF;
  IF app.staff_auth_accept(gen_random_uuid(),token,'invite',password_hash) THEN RAISE EXCEPTION 'SUPPLY_FOREIGN_ORG_ACCEPTED'; END IF;
  IF NOT app.staff_auth_accept(org,token,'invite',password_hash) OR app.staff_auth_accept(org,token,'invite',password_hash) THEN RAISE EXCEPTION 'SUPPLY_INVITE_REPLAY'; END IF;
  IF (SELECT count(*) FROM app.staff_auth_lookup(org,address))<>1 OR NOT app.staff_auth_start(member,1,session_hash) THEN RAISE EXCEPTION 'SUPPLY_LOGIN_FAILED'; END IF;
  SELECT * INTO identity FROM app.staff_auth_resolve(session_hash);
  expected:=CASE WHEN role_code='procurement' THEN ARRAY['purchase.manage','supply.read'] ELSE ARRAY['stock.manage','supply.read'] END;
  IF identity.role_code IS DISTINCT FROM role_code OR identity.permissions IS DISTINCT FROM expected OR identity.property_ids IS DISTINCT FROM ARRAY[property] OR identity.verification_channel<>'local_fixture' THEN RAISE EXCEPTION 'SUPPLY_SCOPE_OR_PERMISSION_DRIFT'; END IF;
  IF app.staff_mfa(org,session_hash,'state','{}')->>'registered'<>'false' THEN RAISE EXCEPTION 'SUPPLY_MFA_UNAVAILABLE'; END IF;
  -- An enrolled factor cannot be silently downgraded by changing the password.
  INSERT INTO staff_private.passkeys(id,membership_id,public_key,counter) VALUES('synthetic_'||replace(member::text,'-',''),member,decode(repeat('ab',16),'hex'),0);
  BEGIN
   PERFORM app.staff_auth_change(session_hash,1,password_hash); RAISE EXCEPTION 'SUPPLY_ASSURANCE_BYPASSED';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'STAFF_ASSURANCE_REQUIRED' THEN RAISE; END IF; END;
  UPDATE staff_private.sessions SET passkey_verified_until=clock_timestamp()+interval '1 minute' WHERE token_hash=session_hash;
  IF NOT app.staff_auth_change(session_hash,1,password_hash) OR EXISTS(SELECT 1 FROM app.staff_auth_resolve(session_hash)) THEN RAISE EXCEPTION 'SUPPLY_PASSWORD_REVOCATION_FAILED'; END IF;
  session_hash:=encode(public.digest(gen_random_uuid()::text,'sha256'),'hex');
  IF NOT app.staff_auth_start(member,2,session_hash) THEN RAISE EXCEPTION 'SUPPLY_RELOGIN_FAILED'; END IF;
  UPDATE public.organization_memberships SET status='suspended' WHERE id=member;
  UPDATE public.organization_memberships SET status='active' WHERE id=member;
  IF EXISTS(SELECT 1 FROM app.staff_auth_resolve(session_hash)) THEN RAISE EXCEPTION 'SUPPLY_SESSION_RESURRECTED'; END IF;
  session_hash:=encode(public.digest(gen_random_uuid()::text,'sha256'),'hex');
  IF NOT app.staff_auth_start(member,2,session_hash) THEN RAISE EXCEPTION 'SUPPLY_ROLE_TEST_LOGIN_FAILED'; END IF;
  UPDATE public.organization_memberships SET role_id=(SELECT id FROM public.roles WHERE code=CASE WHEN role_code='procurement' THEN 'warehouse' ELSE 'procurement' END) WHERE id=member;
  IF EXISTS(SELECT 1 FROM app.staff_auth_resolve(session_hash)) THEN RAISE EXCEPTION 'SUPPLY_CROSS_ROLE_SESSION_SURVIVED'; END IF;
  UPDATE public.organization_memberships SET role_id=(SELECT id FROM public.roles WHERE code=role_code) WHERE id=member;
  -- Recipient-bound capture flow retains mail receipt gating and never verifies email.
  token:=encode(public.digest(gen_random_uuid()::text,'sha256'),'hex'); job:=gen_random_uuid(); request_id:=gen_random_uuid();
  IF staff_private.enqueue_mail(org,member,request_id,job,'reset',address,token,repeat('a',64),'fixture','capture')<>job THEN RAISE EXCEPTION 'SUPPLY_MAIL_ENQUEUE_FAILED'; END IF;
  IF staff_private.enqueue_mail(org,member,request_id,gen_random_uuid(),'reset',address,repeat('b',64),repeat('c',64),'fixture','capture')<>job THEN RAISE EXCEPTION 'SUPPLY_MAIL_REPLAY_FAILED'; END IF;
  IF app.staff_auth_accept(org,token,'reset',password_hash) THEN RAISE EXCEPTION 'SUPPLY_MAIL_RECEIPT_BYPASSED'; END IF;
  SELECT * INTO claimed FROM staff_mail_ops.claim(org,'capture');
  IF claimed.id IS DISTINCT FROM job OR NOT staff_mail_ops.ready(org,job,claimed.lease_id) OR NOT staff_mail_ops.finish(org,job,claimed.lease_id,'accepted','CAPTURED') THEN RAISE EXCEPTION 'SUPPLY_MAIL_LEASE_FAILED'; END IF;
  IF NOT app.staff_auth_accept(org,token,'reset',password_hash) THEN RAISE EXCEPTION 'SUPPLY_MAIL_ACCEPT_FAILED'; END IF;
  IF EXISTS(SELECT 1 FROM staff_private.credentials WHERE membership_id=member AND (verified_email IS NOT NULL OR verification_channel<>'local_fixture')) THEN RAISE EXCEPTION 'SUPPLY_CAPTURE_VERIFIED_EMAIL'; END IF;
  token:=encode(public.digest(gen_random_uuid()::text,'sha256'),'hex');
  PERFORM staff_private.issue_token(member,'reset',token,'local_fixture');
  UPDATE staff_private.activation_tokens SET expires_at=clock_timestamp()-interval '1 second' WHERE token_hash=token;
  IF app.staff_auth_accept(org,token,'reset',password_hash) THEN RAISE EXCEPTION 'SUPPLY_EXPIRED_TOKEN_ACCEPTED'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.audit_log WHERE actor_membership_id=member AND action='staff.password_reset') THEN RAISE EXCEPTION 'SUPPLY_AUDIT_MISSING'; END IF;
 END LOOP;
 -- The dedicated roles do not admit privileged or guest roles to password login.
 FOREACH role_code IN ARRAY ARRAY['owner','manager','accountant','platform_admin','guest'] LOOP
  IF NOT EXISTS(SELECT 1 FROM public.roles WHERE code=role_code) THEN CONTINUE; END IF;
  person:=gen_random_uuid(); member:=gen_random_uuid(); address:='denied-'||person::text||'@views.invalid';
  INSERT INTO public.users(id,email,display_name,status) VALUES(person,address,'Synthetic denied auth','active');
  INSERT INTO public.organization_memberships(id,organization_id,user_id,role_id,status) SELECT member,org,person,id,'invited' FROM public.roles WHERE code=role_code;
  BEGIN
   PERFORM staff_private.issue_token(member,'invite',repeat('d',64),'local_fixture'); RAISE EXCEPTION 'PRIVILEGED_INVITE_ALLOWED';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'STAFF_PILOT_ROLE_DENIED' THEN RAISE; END IF; END;
  BEGIN
   PERFORM staff_private.enqueue_mail(org,member,gen_random_uuid(),gen_random_uuid(),'invite',address,repeat('d',64),repeat('a',64),'fixture','capture'); RAISE EXCEPTION 'PRIVILEGED_MAIL_ALLOWED';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'STAFF_MAIL_ROLE_DENIED' THEN RAISE; END IF; END;
  UPDATE public.organization_memberships SET status='active' WHERE id=member;
  INSERT INTO staff_private.credentials(membership_id,password_hash,verification_channel) VALUES(member,password_hash,'local_fixture');
  IF EXISTS(SELECT 1 FROM app.staff_auth_lookup(org,address)) OR app.staff_auth_start(member,1,repeat('e',64)) THEN RAISE EXCEPTION 'PRIVILEGED_LOGIN_ALLOWED'; END IF;
 END LOOP;
 IF has_function_privilege('views_app','staff_private.issue_token(uuid,text,text,text)','EXECUTE') OR has_function_privilege('views_app','staff_private.enqueue_mail(uuid,uuid,uuid,uuid,text,text,text,text,text,text)','EXECUTE') THEN RAISE EXCEPTION 'RUNTIME_OPERATOR_PRIVILEGE_EXPANDED'; END IF;
 RAISE NOTICE 'Supply roles: invitation, property/permission scope, assurance, revocation, mail lease/replay, expiry and privileged exclusion PASS';
END $proof$;
ROLLBACK;
