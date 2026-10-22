-- Isolated administrative checks: no persistent development DB or real email.
BEGIN;
DO $$
DECLARE first_id uuid:=gen_random_uuid(); second_id uuid:=gen_random_uuid(); result record; guest_id uuid; address text:='email-clock-proof@views.invalid';
BEGIN
 IF current_database()<>'views' OR shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') IS DISTINCT FROM 'VIEWS_DISPOSABLE_CORE_TEST' THEN RAISE EXCEPTION 'DISPOSABLE_DATABASE_REQUIRED'; END IF;
 PERFORM app.issue_guest_email_challenge(first_id,address,repeat('a',64),'ru');
 PERFORM app.mark_guest_email_delivery(first_id,true);
 SELECT * INTO result FROM app.exchange_guest_email_token(first_id,NULL,repeat('b',64));
 IF result.outcome<>'invalid' THEN RAISE EXCEPTION 'EMAIL_NULL_DIGEST'; END IF;
 UPDATE guest_identity_private.email_challenges SET expires_at=clock_timestamp()-interval '1 second' WHERE id=first_id;
 SELECT * INTO result FROM app.exchange_guest_email_token(first_id,repeat('a',64),repeat('b',64));
 IF result.outcome<>'invalid' THEN RAISE EXCEPTION 'EMAIL_EXPIRED_LINK'; END IF;
 UPDATE guest_identity_private.email_challenges SET expires_at=clock_timestamp()+interval '1 minute',created_at=clock_timestamp()-interval '2 minutes' WHERE id=first_id;
 PERFORM app.issue_guest_email_challenge(second_id,address,repeat('c',64),'en');
 IF app.mark_guest_email_delivery(first_id,true) THEN RAISE EXCEPTION 'EMAIL_LATE_DELIVERY'; END IF;
 SELECT * INTO result FROM app.exchange_guest_email_token(first_id,repeat('a',64),repeat('b',64));
 IF result.outcome<>'invalid' THEN RAISE EXCEPTION 'EMAIL_SUPERSEDED_LINK'; END IF;
 PERFORM app.mark_guest_email_delivery(second_id,true);
 SELECT * INTO result FROM app.exchange_guest_email_token(second_id,repeat('c',64),repeat('d',64));
 IF result.outcome<>'verified' THEN RAISE EXCEPTION 'EMAIL_VERIFIED_LINK'; END IF;
 guest_id:=result.guest_user_id;
 IF EXISTS(SELECT 1 FROM organization_memberships WHERE user_id=guest_id) THEN RAISE EXCEPTION 'EMAIL_GRANTED_MEMBERSHIP'; END IF;
 IF EXISTS(SELECT 1 FROM guest_profiles WHERE user_id=guest_id) THEN RAISE EXCEPTION 'EMAIL_GRANTED_RESERVATION_PROFILE'; END IF;
 UPDATE guest_identity_private.email_sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE token_hash=repeat('d',64);
 IF EXISTS(SELECT 1 FROM app.resolve_guest_email_identity(repeat('d',64))) THEN RAISE EXCEPTION 'EMAIL_SESSION_EXPIRY'; END IF;
 -- A pre-existing employee email still exchanges into a guest-only session.
 UPDATE users SET email='employee-email-proof@views.invalid' WHERE id='20000000-0000-4000-8000-000000000001';
 first_id:=gen_random_uuid();
 PERFORM app.issue_guest_email_challenge(first_id,'employee-email-proof@views.invalid',repeat('e',64),'uz');
 PERFORM app.mark_guest_email_delivery(first_id,true);
 SELECT * INTO result FROM app.exchange_guest_email_token(first_id,repeat('e',64),repeat('f',64));
 IF result.outcome<>'verified' OR result.guest_user_id<>'20000000-0000-4000-8000-000000000001' THEN RAISE EXCEPTION 'EMAIL_EMPLOYEE_IDENTITY'; END IF;
 IF EXISTS(SELECT 1 FROM app.staff_auth_resolve(repeat('f',64))) THEN RAISE EXCEPTION 'EMAIL_STAFF_SESSION_CONFUSION'; END IF;
 IF (SELECT count(*) FROM users WHERE lower(email)='employee-email-proof@views.invalid')<>1 THEN RAISE EXCEPTION 'EMAIL_DUPLICATE_IDENTITY'; END IF;
 RAISE NOTICE 'Guest email expiry/supersession/session/account separation proofs PASS';
END $$;
ROLLBACK;
