# Stage 5 — Uzbekistan Compliance

Status: implemented and verified in VIEWS Production Core.

## Delivered

- country compliance policy versions
- reservation guest manifest
- encrypted guest document metadata model
- guest document storage-region policy
- E-mehmon-ready registration queue
- registration attempts / retry metadata
- durable lease/backoff fields
- fiscalization request queue
- fiscalization attempts / retry metadata
- provider boundaries for:
  - guest registration
  - document vault
  - fiscalization
- personal-data base registration tracking
- payment.captured / payment.refunded outbox boundary
- fiscal receipt source linked to provider transaction
- non-recursive membership-role RLS helper
- server-side compliance role checks
- integration tests with test-only adapters

## Provider connection status

Production adapters are NOT_CONNECTED until real credentials/contracts are supplied.

Expected production adapter identifiers are deployment-specific.

Examples:
- guest registration: emehmon
- fiscalization: ODF / virtual cash register provider
- document vault: Uzbekistan-region encrypted object storage + KMS

The production registry starts empty.
A missing adapter produces:
- REGISTRATION_PROVIDER_NOT_CONNECTED
- DOCUMENT_VAULT_NOT_CONNECTED
- FISCALIZATION_PROVIDER_NOT_CONNECTED

No fake success path is enabled in production.

## Registration flow

Confirmed booking
-> reservation_guests
-> verified guest document
-> compliance policy lookup
-> guest_registration_case
-> staff queue
-> document storage-region validation
-> document vault decrypt/read
-> E-mehmon provider adapter
-> submitted / confirmed
-> confirmation reference/proof
-> outbox event

Case statuses:
- draft
- ready
- submitted
- confirmed
- rejected
- manual_review
- cancelled

Cases have:
- due_at
- attempt_count
- next_attempt_at
- lease_until
- locked_by
- policy snapshot
- provider
- external registration reference

Network calls do not hold a database transaction open.

## Registration deadline

VIEWS does not hard-code one universal E-mehmon submission deadline.

The active compliance policy supplies:
- provider
- dueHours
- documentVaultId

Reason: legal deadlines and operational requirements can change and can differ by registration category.

The due time is frozen on each registration case.

## Tourist / hotel fee

Stage 3 already provides the configurable charge engine.

The Uzbekistan policy primitive confirms only eligibility structure:
- guests younger than 16 are excluded
- age 16+ is eligible
- resident/non-resident is preserved as charge context

The production rate is NOT hard-coded.

Current regulations must be converted into versioned charge_rules by accountant/legal review.

The engine supports:
- resident / non-resident
- age threshold
- per guest per night
- percentage rules
- region/property scope
- effective dates
- versioned legal metadata

## Fiscalization flow

Verified payment provider transaction
-> payment.captured / payment.refunded outbox event
-> fiscalization policy lookup
-> fiscalization_request
-> provider adapter
-> submitted / confirmed receipt
-> fiscal sign / receipt URL
-> outbox event

A fiscal request is unique per provider transaction.

This supports:
- partial captures
- multiple captures
- partial refunds
- multiple refunds

without generating a duplicate receipt for the same transaction.

## Personal data / documents

Guest document records do not require plaintext document numbers in PostgreSQL.

Supported fields:
- encrypted_fields
- document_number_hash
- object_key
- object checksum
- storage_region
- encryption_key_ref
- verification status

Product default for Uzbekistan guest identity documents:
- storage region = UZ

This is intentionally stricter than the minimum 2026 localization rule.

The data-residency policy is versioned in PostgreSQL and checked before registration submission.

## Personal-data database registration

personal_data_base_registrations tracks:
- system code
- registry status
- external registry reference
- submission date
- confirmation date
- metadata

This is operational tracking only.
It does not itself register a database with the state authority.

## Legal facts verified during Stage 5

### Guest registration

Law O'RQ-1074 / ЗРУ-1074 and official government guidance confirm that persons staying in accommodation facilities are registered by responsible staff through E-mehmon.

### Tourist/hotel fee

The current 2026 version of Cabinet Resolution 475 provides that:
- children under 16 are excluded
- local and foreign guests have different calculation rules
- the fee is charged per day of stay
- current foreign-guest rates depend on accommodation category / room count

Production numeric rules remain CHECK WITH ACCOUNTANT/LAWYER before seeding.

### Personal data

O'RQ-1125 / ЗРУ-1125 (26 March 2026) amended the Personal Data Law.

Mandatory in-country storage applies to specified categories including:
- biometric data
- genetic data
- data of users of telecommunications operators operating in Uzbekistan

Other personal data may be processed/stored outside Uzbekistan if statutory conditions are met.

VIEWS still defaults guest identity documents to UZ storage as a product/security decision.

## API

POST /v1/compliance/registrations/reservations/:reservationId/prepare

Creates missing registration cases idempotently.

GET /v1/compliance/registrations?propertyId=...&status=...

Returns the staff registration queue.

POST /v1/compliance/registrations/:caseId/submit

Submits through the configured guest-registration adapter.

POST /v1/compliance/fiscalization/provider-transactions/:transactionId/prepare

Creates a fiscal request idempotently from one captured/refunded provider transaction.

POST /v1/compliance/fiscalization/:requestId/submit

Submits the fiscal receipt to the connected provider.

GET /v1/compliance/providers

Shows actually registered runtime adapters.
An empty list is expected until live adapters are connected.

## Database migrations

- 0009_uzbekistan_compliance.sql
- 0010_identity_rls_role_helpers.sql

0010 fixes an older recursive organization_memberships RLS policy by using SECURITY DEFINER helper functions with a fixed search_path.

## Automated verification

VIEWS Production Core verifies:
- migrations 0001 through 0010
- PostgreSQL 16
- no-overbooking constraint
- tenant and property RLS
- restricted views_app runtime role
- compliance provider registry has no fake production adapters
- tourist fee age eligibility boundary
- residency classification
- UZ document storage default
- configurable registration deadline
- registration case creation
- UZ storage-region enforcement
- test-only vault + E-mehmon adapter submission
- confirmed registration queue state
- one fiscal request per provider transaction
- test-only fiscalization adapter
- confirmed fiscal receipt
- all prior booking/payment/ledger tests
- NestJS typecheck
- NestJS production build

## Local run

1. docker compose -f docker-compose.production-dev.yml up -d
2. Apply PostgreSQL extensions.
3. Apply migrations 0001 through 0010 in order.
4. Create restricted views_app role per ADR 0002.
5. cd apps/api
6. npm install
7. DATABASE_URL=postgresql://views_app:<password>@localhost:5432/views npm test
8. npm run typecheck
9. npm run build
10. npm run start:dev

## CHECK MANUALLY before live Uzbekistan launch

Legal/accounting:
- current E-mehmon integration procedure and credentials
- exact submission deadline for each guest category
- current tourist/hotel fee table and BHM value
- resident / foreign-guest classification details
- VAT applicability and taxable base by product
- fiscal receipt timing and correction/refund procedure
- selected ODF / virtual cash register contract
- personal-data database registration process
- lawful cross-border transfer conditions

Security/infrastructure:
- Uzbekistan-region S3-compatible document storage
- KMS/HSM key management
- document encryption envelope design
- retention and deletion periods
- audit access to guest documents
- backup location and encryption
- incident-response procedure

Provider behavior:
- registration provider idempotency behavior
- provider retry limits
- confirmation proof format
- fiscalization idempotency contract
- fiscal correction/refund receipts
- provider outage SLA and manual fallback process

## Explicitly not implemented yet

- live E-mehmon adapter
- live ODF / virtual cash provider adapter
- live document vault adapter
- automated state-authority database registration
- hard-coded Uzbekistan tax/tourist-fee rates

Those require real provider/legal/accounting inputs and must not be simulated in production.
