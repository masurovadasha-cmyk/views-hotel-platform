BEGIN;
-- No execution adapter: this registry records a proposed payout, never a transfer.
CREATE TABLE host_payout_drafts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, property_id uuid NOT NULL,
 reservation_id uuid NOT NULL, currency char(3) NOT NULL,
 amount_minor bigint NOT NULL CHECK(amount_minor>0),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','cancelled')),
 economic_snapshot_id uuid NOT NULL REFERENCES reservation_economic_snapshots(id),
 legal_model_reference text NOT NULL CHECK(length(legal_model_reference) BETWEEN 1 AND 200),
 idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 160),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,property_id,reservation_id,currency) REFERENCES reservations(organization_id,property_id,id,currency),
 UNIQUE(organization_id,idempotency_key), UNIQUE(economic_snapshot_id)
);
CREATE INDEX host_payout_drafts_work_idx ON host_payout_drafts(organization_id,property_id,status,created_at,id);
CREATE FUNCTION app.validate_payout_draft() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 PERFORM 1 FROM public.reservation_economic_snapshots WHERE id=NEW.economic_snapshot_id
  AND organization_id=NEW.organization_id AND property_id=NEW.property_id AND reservation_id=NEW.reservation_id
  AND currency=NEW.currency AND status='finalized' AND owner_payable_minor=NEW.amount_minor FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PAYOUT_ECONOMICS_MISMATCH' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (OLD.status<>'draft' OR NEW.status<>'cancelled' OR
  (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status')) THEN
  RAISE EXCEPTION 'PAYOUT_DRAFT_IMMUTABLE' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payout_draft_check BEFORE INSERT OR UPDATE ON host_payout_drafts FOR EACH ROW EXECUTE FUNCTION app.validate_payout_draft();
CREATE TABLE reservation_disputes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, property_id uuid NOT NULL,
 reservation_id uuid NOT NULL, currency char(3) NOT NULL,
 claimed_minor bigint NOT NULL CHECK(claimed_minor>=0),
 reason_code text NOT NULL CHECK(length(reason_code) BETWEEN 1 AND 80),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','reviewing','resolved','rejected')),
 resolution_code text, resolved_at timestamptz,
 idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 160),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,property_id,reservation_id,currency) REFERENCES reservations(organization_id,property_id,id,currency),
 UNIQUE(organization_id,idempotency_key), UNIQUE(organization_id,property_id,id),
 CHECK((status IN ('open','reviewing') AND resolution_code IS NULL AND resolved_at IS NULL) OR
       (status IN ('resolved','rejected') AND resolution_code IS NOT NULL AND resolved_at IS NOT NULL))
);
CREATE INDEX reservation_disputes_work_idx ON reservation_disputes(organization_id,property_id,status,created_at,id);
CREATE TABLE dispute_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, property_id uuid NOT NULL,
 dispute_id uuid NOT NULL, event_type text NOT NULL CHECK(length(event_type) BETWEEN 1 AND 80),
 metadata jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(metadata)='object'),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,property_id,dispute_id) REFERENCES reservation_disputes(organization_id,property_id,id)
);
CREATE INDEX dispute_events_case_idx ON dispute_events(organization_id,dispute_id,created_at,id);
CREATE TRIGGER dispute_events_immutable BEFORE UPDATE OR DELETE ON dispute_events FOR EACH ROW EXECUTE FUNCTION app.registry_append_only();

-- Review content has no staff/host SELECT policy before publication. A later
-- authenticated guest/host API must mediate submission; no anonymous write path.
CREATE TABLE stay_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, property_id uuid NOT NULL,
 reservation_id uuid NOT NULL, currency char(3) NOT NULL,
 author_side text NOT NULL CHECK(author_side IN ('guest','host')),
 overall_rating smallint NOT NULL CHECK(overall_rating BETWEEN 1 AND 5),
 cleanliness_rating smallint CHECK(cleanliness_rating BETWEEN 1 AND 5),
 accuracy_rating smallint CHECK(accuracy_rating BETWEEN 1 AND 5),
 location_rating smallint CHECK(location_rating BETWEEN 1 AND 5),
 communication_rating smallint CHECK(communication_rating BETWEEN 1 AND 5),
 value_rating smallint CHECK(value_rating BETWEEN 1 AND 5),
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 5000),
 created_at timestamptz NOT NULL DEFAULT now(),
 publish_after timestamptz NOT NULL,
 published_at timestamptz,
 FOREIGN KEY(organization_id,property_id,reservation_id,currency) REFERENCES reservations(organization_id,property_id,id,currency),
 UNIQUE(organization_id,reservation_id,author_side)
);
CREATE INDEX stay_reviews_publication_idx ON stay_reviews(organization_id,publish_after,id) WHERE published_at IS NULL;
CREATE INDEX stay_reviews_property_idx ON stay_reviews(organization_id,property_id,published_at,id) WHERE published_at IS NOT NULL;
CREATE FUNCTION app.validate_stay_review() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE departure timestamptz; booking_status text;
BEGIN
 -- Serializes both submissions/publication for this reservation, including scopes
 -- whose RLS cannot yet see the other party's hidden review.
 SELECT check_out_at,status INTO departure,booking_status FROM public.reservations
  WHERE id=NEW.reservation_id AND organization_id=NEW.organization_id FOR UPDATE;
 IF TG_OP='INSERT' THEN
  IF booking_status IS DISTINCT FROM 'checked_out' OR departure>now() OR departure+interval '14 days'<=now() THEN
   RAISE EXCEPTION 'REVIEW_WINDOW_CLOSED' USING ERRCODE='23514'; END IF;
  NEW.created_at:=now(); NEW.publish_after:=departure+interval '14 days';
  IF NEW.published_at IS NOT NULL THEN RAISE EXCEPTION 'REVIEW_PUBLICATION_REQUIRED' USING ERRCODE='23514'; END IF;
 ELSE
  IF OLD.published_at IS NOT NULL OR NEW.published_at IS NULL OR
   (to_jsonb(NEW)-'published_at') IS DISTINCT FROM (to_jsonb(OLD)-'published_at') THEN
   RAISE EXCEPTION 'REVIEW_IMMUTABLE' USING ERRCODE='23514'; END IF;
  IF now()<OLD.publish_after AND NOT EXISTS(SELECT 1 FROM public.stay_reviews
   WHERE organization_id=OLD.organization_id AND reservation_id=OLD.reservation_id AND author_side<>OLD.author_side) THEN
   RAISE EXCEPTION 'REVIEW_STILL_BLIND' USING ERRCODE='23514'; END IF;
  NEW.published_at:=now();
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.validate_stay_review() FROM PUBLIC;
CREATE TRIGGER stay_review_check BEFORE INSERT OR UPDATE ON stay_reviews FOR EACH ROW EXECUTE FUNCTION app.validate_stay_review();
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['host_payout_drafts','reservation_disputes','dispute_events','stay_reviews'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tab);
  IF tab='stay_reviews' THEN
   EXECUTE 'CREATE POLICY reviews_published_read ON stay_reviews FOR SELECT USING(published_at IS NOT NULL AND app.registry_access(organization_id,property_id,''reservation.read''))';
   -- Deliberately no runtime write grant/policy until participant authentication in B8.
  ELSE
   EXECUTE format('CREATE POLICY registry_read ON %I FOR SELECT USING(app.registry_access(organization_id,property_id,''finance.read''))',tab);
   EXECUTE format('CREATE POLICY registry_insert ON %I FOR INSERT WITH CHECK(app.registry_access(organization_id,property_id,''finance.manage''))',tab);
   IF tab<>'dispute_events' THEN
    EXECUTE format('CREATE POLICY registry_update ON %I FOR UPDATE USING(app.registry_access(organization_id,property_id,''finance.manage'')) WITH CHECK(app.registry_access(organization_id,property_id,''finance.manage''))',tab);
   END IF;
  END IF;
 END LOOP;
END $$;
COMMIT;
