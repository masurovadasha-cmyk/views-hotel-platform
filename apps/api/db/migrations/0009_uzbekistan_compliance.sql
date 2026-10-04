BEGIN;

CREATE TYPE guest_document_type AS ENUM (
  'passport','id_card','birth_certificate','residence_permit','travel_document','other'
);
CREATE TYPE document_verification_status AS ENUM ('pending','verified','rejected','expired');
CREATE TYPE guest_registration_status AS ENUM (
  'draft','ready','submitted','confirmed','rejected','manual_review','cancelled'
);
CREATE TYPE fiscalization_status AS ENUM ('pending','submitted','confirmed','failed','cancelled');
CREATE TYPE fiscal_receipt_type AS ENUM ('sale','refund');

CREATE TABLE compliance_policy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  country_code char(2) NOT NULL,
  code text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  config jsonb NOT NULL,
  legal_references jsonb NOT NULL DEFAULT '[]'::jsonb,
  effective_from date NOT NULL,
  effective_to date,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,country_code,code,version)
);
CREATE INDEX compliance_policy_active_idx
  ON compliance_policy_versions(organization_id,country_code,code,effective_from,effective_to)
  WHERE active=true;

CREATE TABLE reservation_guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  reservation_id uuid NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  guest_profile_id uuid REFERENCES guest_profiles(id),
  is_primary boolean NOT NULL DEFAULT false,
  first_name text NOT NULL,
  last_name text NOT NULL,
  date_of_birth date NOT NULL,
  nationality_country_code char(2) NOT NULL,
  residency_country_code char(2),
  citizenship_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reservation_guests_reservation_idx ON reservation_guests(reservation_id);
CREATE UNIQUE INDEX reservation_one_primary_guest
  ON reservation_guests(reservation_id)
  WHERE is_primary=true;

CREATE TABLE guest_document_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  reservation_guest_id uuid NOT NULL REFERENCES reservation_guests(id) ON DELETE CASCADE,
  document_type guest_document_type NOT NULL,
  issuing_country_code char(2),
  expires_on date,
  document_number_hash text,
  encrypted_fields bytea,
  object_key text,
  object_checksum_sha256 text,
  storage_region text NOT NULL,
  encryption_key_ref text,
  verification_status document_verification_status NOT NULL DEFAULT 'pending',
  verified_at timestamptz,
  verified_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    encrypted_fields IS NOT NULL
    OR object_key IS NOT NULL
  )
);
CREATE INDEX guest_documents_guest_idx ON guest_document_records(reservation_guest_id);
CREATE INDEX guest_documents_org_hash_idx
  ON guest_document_records(organization_id,document_number_hash)
  WHERE document_number_hash IS NOT NULL;

CREATE TABLE guest_registration_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  property_id uuid NOT NULL REFERENCES properties(id),
  reservation_id uuid NOT NULL REFERENCES reservations(id),
  reservation_guest_id uuid NOT NULL REFERENCES reservation_guests(id),
  country_code char(2) NOT NULL,
  provider text NOT NULL,
  status guest_registration_status NOT NULL DEFAULT 'draft',
  due_at timestamptz NOT NULL,
  submitted_at timestamptz,
  confirmed_at timestamptz,
  external_registration_id text,
  confirmation_object_key text,
  policy_snapshot jsonb NOT NULL,
  last_error_code text,
  last_error_message text,
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  locked_by text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(reservation_guest_id,provider)
);
CREATE INDEX guest_registration_queue_idx
  ON guest_registration_cases(property_id,status,due_at,next_attempt_at,lease_until);
CREATE INDEX guest_registration_reservation_idx
  ON guest_registration_cases(reservation_id);

CREATE TABLE guest_registration_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_case_id uuid NOT NULL REFERENCES guest_registration_cases(id) ON DELETE CASCADE,
  request_digest text NOT NULL,
  response_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempt_status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX guest_registration_attempts_case_idx
  ON guest_registration_attempts(registration_case_id,created_at DESC);

CREATE TABLE fiscalization_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  reservation_id uuid REFERENCES reservations(id),
  payment_intent_id uuid REFERENCES payment_intents(id),
  ledger_journal_id uuid REFERENCES ledger_journals(id),
  provider text NOT NULL,
  receipt_type fiscal_receipt_type NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency char(3) NOT NULL,
  status fiscalization_status NOT NULL DEFAULT 'pending',
  idempotency_key text NOT NULL,
  payload_snapshot jsonb NOT NULL,
  external_receipt_id text,
  fiscal_sign text,
  receipt_url text,
  submitted_at timestamptz,
  confirmed_at timestamptz,
  last_error text,
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  locked_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,idempotency_key)
);
CREATE INDEX fiscalization_due_idx
  ON fiscalization_requests(organization_id,status,next_attempt_at,lease_until)
  WHERE status IN ('pending','failed','submitted');

CREATE TABLE fiscalization_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscalization_request_id uuid NOT NULL REFERENCES fiscalization_requests(id) ON DELETE CASCADE,
  request_digest text NOT NULL,
  response_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempt_status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fiscalization_attempts_request_idx
  ON fiscalization_attempts(fiscalization_request_id,created_at DESC);

CREATE TABLE data_residency_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  country_code char(2) NOT NULL,
  data_category text NOT NULL,
  required_storage_region text,
  cross_border_allowed boolean NOT NULL DEFAULT false,
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  legal_references jsonb NOT NULL DEFAULT '[]'::jsonb,
  effective_from date NOT NULL,
  effective_to date,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,country_code,data_category,effective_from)
);

CREATE TABLE personal_data_base_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  country_code char(2) NOT NULL,
  system_code text NOT NULL,
  registry_status text NOT NULL DEFAULT 'not_registered',
  external_registry_ref text,
  submitted_at timestamptz,
  confirmed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,country_code,system_code)
);

ALTER TABLE compliance_policy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_document_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_registration_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_registration_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscalization_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscalization_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_residency_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_data_base_registrations ENABLE ROW LEVEL SECURITY;

ALTER TABLE compliance_policy_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE reservation_guests FORCE ROW LEVEL SECURITY;
ALTER TABLE guest_document_records FORCE ROW LEVEL SECURITY;
ALTER TABLE guest_registration_cases FORCE ROW LEVEL SECURITY;
ALTER TABLE guest_registration_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE fiscalization_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE fiscalization_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE data_residency_policies FORCE ROW LEVEL SECURITY;
ALTER TABLE personal_data_base_registrations FORCE ROW LEVEL SECURITY;

CREATE POLICY compliance_policy_tenant ON compliance_policy_versions
USING (organization_id=app.current_organization_id())
WITH CHECK (organization_id=app.current_organization_id());

CREATE POLICY reservation_guests_tenant ON reservation_guests
USING (organization_id=app.current_organization_id())
WITH CHECK (organization_id=app.current_organization_id());

CREATE POLICY guest_documents_tenant ON guest_document_records
USING (organization_id=app.current_organization_id())
WITH CHECK (organization_id=app.current_organization_id());

CREATE POLICY guest_registration_cases_tenant ON guest_registration_cases
USING (organization_id=app.current_organization_id())
WITH CHECK (organization_id=app.current_organization_id());

CREATE POLICY guest_registration_attempts_tenant ON guest_registration_attempts
USING (EXISTS(
  SELECT 1 FROM guest_registration_cases c
  WHERE c.id=guest_registration_attempts.registration_case_id
    AND c.organization_id=app.current_organization_id()
))
WITH CHECK (EXISTS(
  SELECT 1 FROM guest_registration_cases c
  WHERE c.id=guest_registration_attempts.registration_case_id
    AND c.organization_id=app.current_organization_id()
));

CREATE POLICY fiscalization_requests_tenant ON fiscalization_requests
USING (organization_id=app.current_organization_id())
WITH CHECK (organization_id=app.current_organization_id());

CREATE POLICY fiscalization_attempts_tenant ON fiscalization_attempts
USING (EXISTS(
  SELECT 1 FROM fiscalization_requests f
  WHERE f.id=fiscalization_attempts.fiscalization_request_id
    AND f.organization_id=app.current_organization_id()
))
WITH CHECK (EXISTS(
  SELECT 1 FROM fiscalization_requests f
  WHERE f.id=fiscalization_attempts.fiscalization_request_id
    AND f.organization_id=app.current_organization_id()
));

CREATE POLICY data_residency_tenant ON data_residency_policies
USING (organization_id=app.current_organization_id())
WITH CHECK (organization_id=app.current_organization_id());

CREATE POLICY personal_data_registry_tenant ON personal_data_base_registrations
USING (organization_id=app.current_organization_id())
WITH CHECK (organization_id=app.current_organization_id());

COMMIT;
