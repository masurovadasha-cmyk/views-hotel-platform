-- Administrative clock/retention proofs, isolated and rolled back.
BEGIN;
DO $$
DECLARE challenge uuid:=gen_random_uuid(); result record; first_user uuid; new_challenge uuid:=gen_random_uuid();
BEGIN
 IF current_database()<>'views' OR shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') IS DISTINCT FROM 'VIEWS_DISPOSABLE_CORE_TEST' THEN RAISE EXCEPTION 'DISPOSABLE_DATABASE_REQUIRED'; END IF;
 IF NOT app.issue_guest_sms_challenge(challenge,'+998000000001',repeat('a',64),'ru') THEN RAISE EXCEPTION 'TEST_SMS_ISSUE'; END IF;
 PERFORM app.mark_guest_sms_delivery(challenge,true);
 SELECT * INTO result FROM app.exchange_guest_sms_code(challenge,NULL,repeat('b',64));
 IF result.outcome<>'invalid' THEN RAISE EXCEPTION 'TEST_SMS_NULL_BYPASS'; END IF;
 UPDATE guest_identity_private.sms_challenges SET expires_at=clock_timestamp()-interval '1 second' WHERE id=challenge;
 SELECT * INTO result FROM app.exchange_guest_sms_code(challenge,repeat('a',64),repeat('b',64));
 IF result.outcome<>'invalid' THEN RAISE EXCEPTION 'TEST_SMS_EXPIRY'; END IF;
 UPDATE guest_identity_private.sms_challenges SET expires_at=clock_timestamp()+interval '1 minute',created_at=clock_timestamp()-interval '2 minutes' WHERE id=challenge;
 IF NOT app.issue_guest_sms_challenge(new_challenge,'+998000000001',repeat('c',64),'uz') THEN RAISE EXCEPTION 'TEST_SMS_REISSUE'; END IF;
 SELECT * INTO result FROM app.exchange_guest_sms_code(challenge,repeat('a',64),repeat('b',64));
 IF result.outcome<>'invalid' THEN RAISE EXCEPTION 'TEST_SMS_SUPERSEDED'; END IF;
 PERFORM app.mark_guest_sms_delivery(new_challenge,true);
 SELECT * INTO result FROM app.exchange_guest_sms_code(new_challenge,repeat('c',64),repeat('d',64));
 IF result.outcome<>'verified' THEN RAISE EXCEPTION 'TEST_SMS_EXCHANGE'; END IF;
 first_user:=result.guest_user_id;
 IF EXISTS(SELECT 1 FROM organization_memberships WHERE user_id=first_user) THEN RAISE EXCEPTION 'TEST_GUEST_MEMBERSHIP_CREATED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.resolve_guest_identity(repeat('d',64))) THEN RAISE EXCEPTION 'TEST_GUEST_SESSION'; END IF;
 UPDATE guest_identity_private.sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE token_hash=repeat('d',64);
 IF EXISTS(SELECT 1 FROM app.resolve_guest_identity(repeat('d',64))) THEN RAISE EXCEPTION 'TEST_GUEST_SESSION_EXPIRY'; END IF;
 UPDATE guest_identity_private.sms_challenges SET created_at=clock_timestamp()-interval '2 minutes' WHERE id=new_challenge;
 new_challenge:=gen_random_uuid();
 PERFORM app.issue_guest_sms_challenge(new_challenge,'+998000000001',repeat('e',64),'en');
 PERFORM app.mark_guest_sms_delivery(new_challenge,true);
 SELECT * INTO result FROM app.exchange_guest_sms_code(new_challenge,repeat('e',64),repeat('f',64));
 IF result.guest_user_id<>first_user OR (SELECT count(*) FROM users WHERE phone_e164='+998000000001')<>1 THEN RAISE EXCEPTION 'TEST_GUEST_DUPLICATE_USER'; END IF;
 RAISE NOTICE 'B2 SMS clock/null/supersession/session/account proofs PASS';
END $$;
ROLLBACK;
