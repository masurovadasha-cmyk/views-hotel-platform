# Stage 5 — Uzbekistan Compliance Foundation

Status: production-core foundation implemented and verified.

This stage builds a country plug-in boundary. It does not claim that VIEWS has live E-mehmon,
fiscal-operator, tax-office, or document-storage credentials. Provider adapters must be explicitly connected.

## Delivered

### Guest registration / E-mehmon boundary
- versioned country compliance policies
- reservation guest registry
- one registration case per reservation guest/provider
- due_at deadline
- ready / submitted / confirmed / rejected / manual_review states
- attempt history
- lease-based submission
- bounded retry/backoff
- idempotent outbox events
- due-soon and overdue alert engine
- property/role/RLS enforcement
- GuestRegistrationProviderPort
- provider registry that reports only connected providers

### Guest identity documents
- metadata record separated from document bytes
- product-controlled storage region
- data-residency policy reference snapshotted on document record
- vault ID / encryption key reference
- SHA-256 object checksum
- document-number hash field
- verification workflow
- staff verifier attribution
- DocumentVaultPort for controlled reads
- DocumentUploadVaultPort for direct presigned upload
- begin -> direct object-store upload -> finalize -> verify workflow

The API does not proxy the document file bytes during the upload workflow.

### Data residency
- versioned data_residency_policies
- required storage region
- cross-border-allowed flag
- policy conditions
- legal reference metadata
- guest registration submission refuses to proceed when the country policy is missing
- document upload records which policy selected its region

### Tourist fee / tax provenance
The generic Stage 3 charge_rules model remains the calculator.

Stage 5 links charge_rules to compliance_policy_versions so an immutable quote line can record:
- compliance policy ID
- effective rule metadata
- age/residency predicates
- exact charge code

No production tourist-fee or VAT rate is hard-coded in TypeScript.

### Fiscalization boundary
- fiscalization request queue
- sale/refund receipt type
- provider transaction reference
- ledger journal reference
- immutable payload snapshot
- idempotency
- provider attempt log
- retry lease/backoff
- FiscalizationProviderPort
- connected-provider registry

The provider-specific virtual cash-register/OFD payload must be implemented only after the accountant
and chosen provider confirm the contractual schema.

### Personal-data-base operational register
personal_data_base_registrations stores:
- country
- VIEWS system code
- operational registry status
- external registry reference
- submitted/confirmed timestamps
- metadata

This table is an operational compliance record. It does not itself perform a government registration.

## Production schema

- apps/api/db/migrations/0009_uzbekistan_compliance.sql
- apps/api/db/migrations/0010_identity_rls_role_helpers.sql

Main tables:
- compliance_policy_versions
- reservation_guests
- guest_document_records
- guest_registration_cases
- guest_registration_attempts
- fiscalization_requests
- fiscalization_attempts
- data_residency_policies
- personal_data_base_registrations

All tenant-owned compliance tables use PostgreSQL RLS.

## API

GET /v1/compliance/providers

Registration:
- POST /v1/compliance/registrations/reservations/:reservationId/prepare
- GET /v1/compliance/registrations?propertyId=...&status=...
- POST /v1/compliance/registrations/:caseId/submit

Document workflow:
- POST /v1/compliance/documents/reservation-guests/:reservationGuestId/uploads
- POST /v1/compliance/documents/:documentRecordId/finalize
- POST /v1/compliance/documents/:documentRecordId/verify

Fiscalization:
- POST /v1/compliance/fiscalization/provider-transactions/:providerTransactionId/prepare
- POST /v1/compliance/fiscalization/:requestId/submit

## Document upload boundary

1. A versioned registration policy selects a vault adapter.
2. A data-residency policy selects the required storage region.
3. VIEWS creates guest_document_records metadata.
4. Vault adapter returns a short-lived HTTPS upload URL.
5. Client sends document bytes directly to regional encrypted object storage.
6. finalize verifies object existence/checksum through the vault adapter.
7. VIEWS stores checksum/key metadata.
8. authorized staff verifies the document.
9. Registration provider reads the decrypted document only through DocumentVaultPort when submitting.

Production object storage must use:
- encryption at rest
- separate key management
- least-privilege service identity
- short-lived presigned URLs
- private bucket/container
- audit logs
- lifecycle/retention policy approved by legal/privacy owner

## Official legal reference check — 2026-10-05

These references are recorded for engineering provenance and must be checked again immediately before launch.

### Registration
Official Lex.uz Law O'RQ/ЗРУ-1074 dated 10 July 2025 describes registration of persons staying
at accommodation facilities through E-mehmon, including electronic forms based on identity/travel
document data. The current text should be revalidated before enabling the live adapter.

Official source:
https://lex.uz/ru/docs/7627933

### Personal data
Official Lex.uz Law O'RQ/ЗРУ-1125 dated 26 March 2026 amended the personal-data law.
Its current text contains special local-storage requirements for specified categories including
biometric/genetic data and data of users of local telecommunications operators, while other
personal data may be stored/processed abroad subject to statutory conditions.

Official source:
https://www.lex.uz/acts/-8099215

VIEWS deliberately uses a stricter product default for guest identity documents: keep them in the
country-specific vault selected by data_residency_policies until legal/privacy review approves otherwise.
This is a product policy, not a statement that every passport image is legally required to be localized.

### Tourist / hotel fee
The current Lex.uz text of Cabinet Resolution No. 475 of 25 August 2022, as amended in 2026,
contains differentiated tourist/hotel-fee rules, including age and resident/foreign-guest treatment.
Do not encode the current percentages or annex rates in source code.

Official source:
https://www.lex.uz/uz/acts/-6173258?ONDATE=17.03.2026+00

Production values must be inserted as versioned compliance_policy_versions + charge_rules
after lawyer/accountant validation of:
- current effective version
- accommodation classification
- region
- local/foreign/residency definition
- age rule
- BHM/BRV value/date
- rounding
- partial-day handling
- tax base
- effective-from date

## CHECK before production launch

Legal/accounting:
- CHECK current E-mehmon submission deadline and provider/API access model.
- CHECK who is legally the responsible accepting party for each marketplace model.
- CHECK current tourist/hotel fee and annex rates.
- CHECK BHM/BRV effective values and effective dates.
- CHECK VAT applicability and taxable base for accommodation and every ancillary service.
- CHECK fiscal receipt timing, item schema, refund receipt rules and partial-payment behavior.
- CHECK whether each personal-data database must be registered and record the external registration.
- CHECK retention/deletion periods for guest identity documents and E-mehmon confirmations.
- CHECK cross-border processing requirements for each future country.

Provider/infrastructure:
- connect a real E-mehmon adapter only after official/contracted access is confirmed
- connect the selected fiscal/OFD/virtual-cash-register adapter
- connect an Uzbekistan-region encrypted document vault
- verify vault restore/backup and key-rotation procedures
- verify webhook/provider retry semantics
- verify no decrypted document content reaches application logs, Sentry or analytics

## Guest Identity / Guest App boundary

Stage 5.1 adds a reservation-scoped guest access layer for online check-in document upload.

- staff issues/revokes short-lived guest access sessions;
- raw tokens are returned once; PostgreSQL stores only SHA-256;
- public guest endpoints authorize with Bearer tokens, not staff tenant headers;
- guest access is restricted to one reservation;
- cross-reservation document access is explicitly rejected;
- guest can begin/finalize document upload but cannot verify documents or submit compliance registration;
- direct regional vault upload remains unchanged.

Detailed contract: `docs/STAGE5_GUEST_SELF_SERVICE.md`.

Remaining production boundary: connect token delivery to a verified guest authentication channel
(email/phone magic link or equivalent), add rate limiting and telemetry redaction before public launch.

Do not expose staff tenant headers directly to a public browser.

## Local run

1. docker compose -f docker-compose.production-dev.yml up -d
2. Apply PostgreSQL migrations 0001 through the current production chain.
3. Use the restricted views_app runtime role.
4. cd apps/api
5. npm install
6. DATABASE_URL=postgresql://views_app:<password>@localhost:5432/views npm test
7. npm run typecheck
8. npm run build
9. npm run start:dev

## Automated verification

The PostgreSQL 16 production-core suite currently verifies:
- registration case preparation
- verified-document readiness
- configured storage-region enforcement
- registration provider submission/idempotency
- deadline due-soon event idempotency
- regional presigned document upload contract
- object checksum finalization
- staff document verification/idempotency
- data-residency policy reference persistence
- fiscalization preparation idempotency
- fiscalization provider submission
- fiscalization attempt audit
- tenant/property RLS
- all previously completed booking/payment/ledger guarantees
- NestJS typecheck
- NestJS production build
