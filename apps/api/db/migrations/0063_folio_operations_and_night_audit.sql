BEGIN;
-- Operational folio postings are not bank transactions or GL revenue recognition.
ALTER TABLE folio_entries ADD COLUMN business_date date;
CREATE INDEX folio_entries_business_date_idx ON folio_entries(organization_id,property_id,business_date,id);
CREATE TABLE folio_commands (
 organization_id uuid NOT NULL REFERENCES organizations(id), command_key uuid NOT NULL,
 property_id uuid NOT NULL, actor_user_id uuid NOT NULL REFERENCES users(id),
 actor_membership_id uuid NOT NULL REFERENCES organization_memberships(id),
 payload jsonb NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(organization_id,command_key), FOREIGN KEY(organization_id,property_id) REFERENCES properties(organization_id,id)
);
CREATE TABLE folio_nightly_plans (
 organization_id uuid NOT NULL, property_id uuid NOT NULL, reservation_id uuid PRIMARY KEY, currency char(3) NOT NULL,
 source_snapshot jsonb NOT NULL, allocations jsonb NOT NULL CHECK(jsonb_typeof(allocations)='array'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(organization_id,property_id,reservation_id,currency) REFERENCES reservations(organization_id,property_id,id,currency)
);
CREATE TABLE folio_night_audits (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, property_id uuid NOT NULL,
 business_date date NOT NULL, timezone text NOT NULL, revision text NOT NULL CHECK(revision ~ '^[a-f0-9]{64}$'),
 reservation_count integer NOT NULL CHECK(reservation_count>=0), posted_count integer NOT NULL CHECK(posted_count>=0),
 zero_amount_count integer NOT NULL CHECK(zero_amount_count>=0), totals jsonb NOT NULL CHECK(jsonb_typeof(totals)='array'),
 actor_user_id uuid NOT NULL REFERENCES users(id),actor_membership_id uuid NOT NULL REFERENCES organization_memberships(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(organization_id,property_id,business_date), FOREIGN KEY(organization_id,property_id) REFERENCES properties(organization_id,id)
);
CREATE INDEX folio_night_audits_property_idx ON folio_night_audits(organization_id,property_id,business_date DESC,id);
CREATE FUNCTION app.folio_operation_access(target_org uuid,target_property uuid,write_access boolean) RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT app.registry_access(target_org,target_property,CASE WHEN write_access THEN 'reservation.manage' ELSE 'reservation.read' END)
$$;
REVOKE ALL ON FUNCTION app.folio_operation_access(uuid,uuid,boolean) FROM PUBLIC;
DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['folio_commands','folio_nightly_plans','folio_night_audits'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING(app.folio_operation_access(organization_id,property_id,false))',table_name||'_read',table_name);
  EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK(app.folio_operation_access(organization_id,property_id,true))',table_name||'_insert',table_name);
  EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION app.registry_append_only()',table_name||'_immutable',table_name);
 END LOOP;
END $$;
CREATE FUNCTION app.validate_folio_operation_actor() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.actor_user_id IS DISTINCT FROM app.current_user_id() OR NEW.actor_membership_id IS DISTINCT FROM app.current_membership_id() THEN RAISE EXCEPTION 'FOLIO_ACTOR_MISMATCH' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER folio_command_actor BEFORE INSERT ON folio_commands FOR EACH ROW EXECUTE FUNCTION app.validate_folio_operation_actor();
CREATE TRIGGER folio_audit_actor BEFORE INSERT ON folio_night_audits FOR EACH ROW EXECUTE FUNCTION app.validate_folio_operation_actor();
-- No new permissions and no alteration of old applied migration checksums.
COMMIT;
