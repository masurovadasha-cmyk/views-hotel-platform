# P1 synthetic partner foundation

Finite mapping: SD-GN-009 dispatcher offer → SP-GN-001 incoming / SP-GN-002 accept or reject. SP-GN-006 portal remains partial. This is independent partner identity and assignment isolation, not real provider onboarding, completed service execution, transfer/delivery, payments, income or all 16 partner screens.

## Identity and data boundary

Migration 0140 creates only `partner_private` provider/principal/property+service grant/session/assignment/command tables. It does not modify organization_type, staff roles, staff memberships or historical migrations. No PUBLIC schema/table/function access. API runtime has only narrowly callable app functions; private tables remain inaccessible. Sessions have hashed random tokens and a maximum one-hour life. There is deliberately no runtime invitation/credential/session issuance endpoint. Tests create only ephemeral synthetic records in the marked disposable database.

A session binds one principal/provider/grant and its current version. Provider, principal and grant must be active; current property and concierge catalog must be active. Grant/principal/provider identity cannot be moved across scope; disabling them revokes old sessions. Re-enabling does not revive old tokens. Assignments bind the original grant version. Staff uses its existing real session + reservation.manage + property scope, never a partner role or fake staff identity.

Only existing concierge service orders can be offered. The source concierge row serializes offer/decisions with existing concierge operations. Accept/reject changes only the partner assignment, with atomic command/audit/outbox; it never changes concierge staff assignment, service-order status, guest messages, stock or folio. Terms v1 mean **synthetic coordination only**. No monetary commitment or service fulfillment is implied.

## Core API

All calls require NODE_ENV=test, VIEWS_LOCAL_REHEARSAL=true, VIEWS_PARTNER_PILOT_ENABLED=true; default off. Responses use Cache-Control:no-store.

- GET `/v1/partner-dispatch?propertyId=UUID&after=UUID`: current staff headers/session. `{items:[{orderId,kind:'concierge',revision,requestedFor,grants:[{grantId,label}],grantsTruncated}],nextCursor}`. At most 20 orders and 50 grants per order; truncated grants must not be presented as a complete provider registry.
- POST `/v1/partner-dispatch/offers`: current staff headers/session, Idempotency-Key UUID, `{orderId,grantId,expectedOrderRevision,expiresAt}`. Explicit ISO UTC expiry, future and at most 24 hours.
- GET `/v1/partner-assignments?after=UUID`: only `x-views-partner-session` raw ephemeral token from protected gateway transport. `{items:[receipt],nextCursor}`; at most 20, UUID keyset order. Never accepts staff actor/session or Authorization headers.
- POST `/v1/partner-assignments/:id/decisions`: partner session, Idempotency-Key UUID, `{action:'accept'|'reject',expectedRevision,termsVersion:1}`.

Receipt: `{assignmentId,kind:'concierge',status,revision,termsVersion:1,requestedFor,expiresAt,synthetic:true}`. Mutation responses add `idempotentReplay`. No guest/name/message/room/reservation/order identifiers, amounts or contacts are projected to partner. Expired offered assignments project status expired. An accepted assignment means the recorded coordination decision only, regardless of later source lifecycle.

Retries revalidate current authorization and return the current assignment projection, not a frozen historical state. Same key/different payload conflicts. Different decisions at the same revision have one winner. Source revision changes block a fresh decision. An expired unaccepted offer can be replaced under the source lock; its historical receipt stays expired. Accepted assignment prevents another offer until a future explicitly designed lifecycle is implemented.

Errors: PARTNER_SESSION_REQUIRED 401; PARTNER_NOT_FOUND/PARTNER_PILOT_DISABLED 404; PARTNER_INPUT_INVALID 400; PARTNER_REVISION_CHANGED/PARTNER_EXPIRED/PARTNER_TRANSITION_INVALID/PARTNER_ALREADY_ASSIGNED/PARTNER_IDEMPOTENCY_CONFLICT 409. Unknown network errors, 401 and 404 may hide a previously committed command: retain durable intent and retry the same key/body only. Do not silently replace a pending key.

## Coordinator wiring

1. Register PartnerService, PartnerDispatchController, PartnerAssignmentsController with DatabaseService available. No frontend module/gateway edits are included in this commit.
2. StaffSessionGuard permits only GET /v1/partner-dispatch and POST /v1/partner-dispatch/offers with reservation.manage; SQL independently checks token/actor/property.
3. Separate partner gateway cookie and CSRF/same-origin validation; transport actual partner token as x-views-partner-session. Do not forward staff actor/session headers or use the local-workspace staff service identity. Do not add a broad staff-guard bypass. Public deployment remains disabled.
4. Update migration checksum manifest; append 0140 only after reviewing numbering with S1 0139 and integration 0137/0138.
5. After compiling API, disposable runner invokes `apps/api/db/tests/partner-foundation.cjs({admin,runtimeUrl})`. It checks the database marker before creating any synthetic records.

## Evidence and remaining checks

Disposable PostgreSQL proof checks non-superuser/non-BYPASSRLS runtime, strict projection, staff/partner isolation, wrong scope, same-key replay/conflict/concurrent offer, competing decisions, 20-row paging, expiry, eight observed source-lock revocation cases, revoked cached replay, and rollback after synthetic outbox failure. Existing source/stock/folio snapshots remain unchanged. Registered standalone Nest controllers on loopback test real SQL-backed HTTP input/header errors and offer→reject→replay. Disabling/re-enabling grant does not revive session. Private tables and PUBLIC EXECUTE denied.

Input tests cover strict fields/terms/revision/IDs/time and default-off API. This is not proof of root AppModule/global guards/gateway wiring, public deployment, browser or APK. Those remain coordinator integration/release checks. No real provider or persistent credential was created.
