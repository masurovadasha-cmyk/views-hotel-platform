BEGIN;
-- Existing identifiers remain unchanged; compound keys protect new tenant references.
ALTER TABLE properties ADD CONSTRAINT properties_org_id_unique UNIQUE(organization_id,id);
ALTER TABLE reservations ADD CONSTRAINT reservations_scope_currency_unique UNIQUE(organization_id,property_id,id,currency);
ALTER TABLE guest_profiles ADD CONSTRAINT guest_profiles_org_id_unique UNIQUE(organization_id,id);
ALTER TABLE ledger_journals ADD CONSTRAINT ledger_journals_org_id_unique UNIQUE(organization_id,id);

-- A new registry must bind all three actor identifiers, an active user, permission,
-- and (when applicable) the actual property. Never trust a membership ID alone.
CREATE FUNCTION app.registry_access(target_org uuid, target_property uuid, permission_code text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT target_org=app.current_organization_id() AND EXISTS(
  SELECT 1 FROM public.organization_memberships m
  JOIN public.users u ON u.id=m.user_id AND u.status='active'
  JOIN public.roles r ON r.id=m.role_id
  JOIN public.role_permissions rp ON rp.role_id=r.id
  JOIN public.permissions p ON p.id=rp.permission_id AND p.code=permission_code
  WHERE m.id=app.current_membership_id() AND m.user_id=app.current_user_id()
   AND m.organization_id=target_org AND m.status='active'
   AND (target_property IS NULL AND r.code IN ('owner','manager','platform_admin')
    OR EXISTS(SELECT 1 FROM public.properties pr WHERE pr.id=target_property AND pr.organization_id=target_org)
     AND (r.code IN ('owner','manager') OR EXISTS(
      SELECT 1 FROM public.membership_property_scopes s WHERE s.membership_id=m.id AND s.property_id=target_property)))
 )
$$;
REVOKE ALL ON FUNCTION app.registry_access(uuid,uuid,text) FROM PUBLIC;

CREATE TABLE guest_folios (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 property_id uuid NOT NULL,
 reservation_id uuid NOT NULL,
 currency char(3) NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 closed_at timestamptz,
 FOREIGN KEY(organization_id,property_id,reservation_id,currency)
  REFERENCES reservations(organization_id,property_id,id,currency),
 UNIQUE(organization_id,reservation_id),
 UNIQUE(organization_id,property_id,id,currency),
 CHECK((status='open' AND closed_at IS NULL) OR (status='closed' AND closed_at IS NOT NULL))
);
CREATE INDEX guest_folios_work_idx ON guest_folios(organization_id,property_id,status,created_at,id);
CREATE TABLE folio_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 property_id uuid NOT NULL,
 folio_id uuid NOT NULL,
 currency char(3) NOT NULL,
 kind text NOT NULL CHECK(kind IN ('accommodation','service','minibar','fee','tax','payment','deposit','refund','reversal')),
 amount_minor bigint NOT NULL CHECK(amount_minor<>0),
 label jsonb NOT NULL CHECK(jsonb_typeof(label)='object'),
 source_type text NOT NULL CHECK(length(source_type) BETWEEN 1 AND 80),
 source_id uuid NOT NULL,
 idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 160),
 reversal_of uuid,
 ledger_journal_id uuid,
 policy_snapshot jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(policy_snapshot)='object'),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,property_id,folio_id,currency) REFERENCES guest_folios(organization_id,property_id,id,currency),
 FOREIGN KEY(organization_id,ledger_journal_id) REFERENCES ledger_journals(organization_id,id),
 UNIQUE(organization_id,idempotency_key),
 UNIQUE(organization_id,folio_id,source_type,source_id),
 UNIQUE(organization_id,folio_id,id),
 FOREIGN KEY(organization_id,folio_id,reversal_of) REFERENCES folio_entries(organization_id,folio_id,id),
 UNIQUE(reversal_of),
 CHECK((kind='reversal')=(reversal_of IS NOT NULL)),
 CHECK(kind NOT IN ('accommodation','service','minibar','fee','tax','refund') OR amount_minor>0),
 CHECK(kind NOT IN ('payment','deposit') OR amount_minor<0)
);
CREATE INDEX folio_entries_statement_idx ON folio_entries(organization_id,folio_id,created_at,id);
CREATE FUNCTION app.registry_append_only() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'REGISTRY_APPEND_ONLY' USING ERRCODE='23514'; END $$;
CREATE TRIGGER folio_entries_immutable BEFORE UPDATE OR DELETE ON folio_entries
 FOR EACH ROW EXECUTE FUNCTION app.registry_append_only();
CREATE FUNCTION app.validate_folio_entry() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE f public.guest_folios; original public.folio_entries;
BEGIN
 SELECT * INTO f FROM public.guest_folios WHERE id=NEW.folio_id FOR UPDATE;
 IF f.id IS NULL OR f.status<>'open' THEN RAISE EXCEPTION 'FOLIO_NOT_OPEN' USING ERRCODE='23514'; END IF;
 IF NEW.reversal_of IS NOT NULL THEN
  SELECT * INTO original FROM public.folio_entries WHERE id=NEW.reversal_of;
  IF original.id IS NULL OR original.kind='reversal' OR original.amount_minor::numeric + NEW.amount_minor::numeric <> 0
   THEN RAISE EXCEPTION 'FOLIO_INVALID_REVERSAL' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER folio_entry_check BEFORE INSERT ON folio_entries FOR EACH ROW EXECUTE FUNCTION app.validate_folio_entry();
ALTER TABLE guest_folios ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_folios FORCE ROW LEVEL SECURITY;
ALTER TABLE folio_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE folio_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY folios_read ON guest_folios FOR SELECT USING(app.registry_access(organization_id,property_id,'reservation.read'));
CREATE POLICY folios_insert ON guest_folios FOR INSERT WITH CHECK(app.registry_access(organization_id,property_id,'reservation.manage'));
CREATE POLICY folios_update ON guest_folios FOR UPDATE USING(app.registry_access(organization_id,property_id,'reservation.manage')) WITH CHECK(app.registry_access(organization_id,property_id,'reservation.manage'));
CREATE POLICY folio_entries_read ON folio_entries FOR SELECT USING(app.registry_access(organization_id,property_id,'reservation.read'));
CREATE POLICY folio_entries_insert ON folio_entries FOR INSERT WITH CHECK(app.registry_access(organization_id,property_id,'reservation.manage'));
COMMIT;
