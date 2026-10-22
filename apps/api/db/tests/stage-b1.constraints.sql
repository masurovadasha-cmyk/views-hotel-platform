-- Administrative constraint proofs on disposable fixtures; all changes rolled back.
BEGIN;
DO $$
DECLARE org uuid:='00000000-0000-0000-0000-000000000001'; prop uuid:='00000000-0000-0000-0000-000000000002';
 booking uuid:=gen_random_uuid(); review uuid:=gen_random_uuid();
BEGIN
 IF current_database()<>'views' OR shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') IS DISTINCT FROM 'VIEWS_DISPOSABLE_CORE_TEST' THEN RAISE EXCEPTION 'DISPOSABLE_DATABASE_REQUIRED'; END IF;
 INSERT INTO reservations(id,organization_id,property_id,unit_id,confirmation_code,status,check_in_at,check_out_at,currency,cancellation_policy_snapshot)
 VALUES(booking,org,prop,'00000000-0000-0000-0000-000000000004',booking,'confirmed',now()-interval '3 days',now()-interval '1 day','UZS','{}');
 BEGIN
  INSERT INTO stay_reviews(organization_id,property_id,reservation_id,currency,author_side,overall_rating,body,publish_after) VALUES(org,prop,booking,'UZS','guest',5,'Synthetic',now());
  RAISE EXCEPTION 'TEST_FAILED_REVIEW_BEFORE_CHECKOUT';
 EXCEPTION WHEN check_violation THEN IF SQLERRM<>'REVIEW_WINDOW_CLOSED' THEN RAISE; END IF; END;
 UPDATE reservations SET status='checked_out' WHERE id=booking;
 INSERT INTO stay_reviews(id,organization_id,property_id,reservation_id,currency,author_side,overall_rating,body,publish_after) VALUES(review,org,prop,booking,'UZS','guest',5,'Synthetic',now());
 BEGIN
  UPDATE stay_reviews SET published_at=now() WHERE id=review;
  RAISE EXCEPTION 'TEST_FAILED_PREMATURE_PUBLICATION';
 EXCEPTION WHEN check_violation THEN IF SQLERRM<>'REVIEW_STILL_BLIND' THEN RAISE; END IF; END;
 BEGIN
  INSERT INTO stay_reviews(organization_id,property_id,reservation_id,currency,author_side,overall_rating,body,publish_after) VALUES(org,prop,booking,'UZS','guest',5,'Duplicate',now());
  RAISE EXCEPTION 'TEST_FAILED_DUPLICATE_REVIEW';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 INSERT INTO stay_reviews(organization_id,property_id,reservation_id,currency,author_side,overall_rating,body,publish_after) VALUES(org,prop,booking,'UZS','host',4,'Synthetic host',now());
 UPDATE stay_reviews SET published_at=now() WHERE reservation_id=booking;
 IF (SELECT count(*) FROM stay_reviews WHERE reservation_id=booking AND published_at IS NOT NULL)<>2 THEN RAISE EXCEPTION 'TEST_FAILED_REVIEW_PUBLICATION'; END IF;
 BEGIN
  UPDATE stay_reviews SET body='Edited after publication' WHERE id=review;
  RAISE EXCEPTION 'TEST_FAILED_MUTABLE_REVIEW';
 EXCEPTION WHEN check_violation THEN IF SQLERRM<>'REVIEW_IMMUTABLE' THEN RAISE; END IF; END;
 UPDATE reservations SET check_out_at=now()-interval '30 days',check_in_at=now()-interval '32 days' WHERE id=booking;
 BEGIN
  INSERT INTO stay_reviews(organization_id,property_id,reservation_id,currency,author_side,overall_rating,body,publish_after) VALUES(org,prop,booking,'UZS','guest',5,'Too late',now());
  RAISE EXCEPTION 'TEST_FAILED_LATE_REVIEW';
 EXCEPTION WHEN check_violation THEN IF SQLERRM<>'REVIEW_WINDOW_CLOSED' THEN RAISE; END IF; END;
 BEGIN
  INSERT INTO host_payout_drafts(organization_id,property_id,reservation_id,currency,amount_minor,economic_snapshot_id,legal_model_reference,idempotency_key)
  VALUES(org,prop,booking,'UZS',100,gen_random_uuid(),'SYNTHETIC ONLY',gen_random_uuid());
  RAISE EXCEPTION 'TEST_FAILED_UNSUPPORTED_PAYOUT';
 EXCEPTION WHEN check_violation THEN IF SQLERRM<>'PAYOUT_ECONOMICS_MISMATCH' THEN RAISE; END IF; END;
 RAISE NOTICE 'B1 constraint proofs: review eligibility, blind window, uniqueness, publication, immutability, deadline, payout provenance PASS';
END $$;
ROLLBACK;
