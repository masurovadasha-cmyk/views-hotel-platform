# Stage 5.1 — Guest Identity / Self-Service Boundary

Status: implementation in progress on `stage5/guest-self-service-v1`.

## Goal

Expose guest online check-in document upload without exposing staff tenant headers, membership IDs,
or unrestricted tenant-scoped APIs to a public browser.

## Security contract

- staff creates a short-lived reservation-scoped guest access session;
- the raw bearer token is returned once and is never persisted;
- PostgreSQL stores only SHA-256 of the token;
- session is bound to exactly one organization + reservation;
- expired or revoked sessions resolve to unauthorized;
- public guest endpoints never accept staff membership/tenant headers as authorization;
- cross-reservation access is rejected even when both reservations belong to the same organization;
- guest may upload/finalize a document, but only staff may verify it;
- document bytes still upload directly to the policy-selected regional vault;
- no decrypted identity document bytes are proxied through the application API.

## Database

Migration:

- `apps/api/db/migrations/0011_guest_access_sessions.sql`

Table:

- `guest_access_sessions`

The table has staff RLS policies for issue/revoke operations.
Token resolution is performed through the restricted SECURITY DEFINER function:

- `app.resolve_guest_access_session(token_hash)`

The function accepts only the SHA-256 token hash and returns the minimum reservation scope.

## Staff API

Create guest access session:

`POST /v1/guest-access/sessions`

Body:

```json
{"reservationId":"<uuid>","ttlMinutes":1440}
```

Required internal actor headers remain the staff-only actor context.

Revoke session:

`POST /v1/guest-access/sessions/:sessionId/revoke`

## Public guest API

All endpoints require:

`Authorization: Bearer vga_<opaque-token>`

Read reservation-scoped self-service state:

`GET /v1/guest/session`

Begin direct document upload:

`POST /v1/guest/documents/reservation-guests/:reservationGuestId/uploads`

Finalize an already uploaded object:

`POST /v1/guest/documents/:documentRecordId/finalize`

The guest API intentionally does not expose document verification or government registration submission.

## Failure boundaries

Return unauthorized when:

- bearer token is absent/malformed;
- token is unknown;
- token is expired;
- token is revoked;
- reservation is no longer in a guest-accessible state.

Return not found without leaking another reservation when:

- reservationGuestId is not in the token reservation;
- documentRecordId is not in the token reservation.

## Automated verification

`apps/api/src/compliance/guest-access.integration.test.ts` verifies:

- opaque token issuance;
- no raw token persisted;
- exact reservation scope resolution;
- summary returns only reservation guests in scope;
- cross-reservation document upload is blocked;
- direct regional vault upload + finalize works in scope;
- token revocation invalidates access immediately.

## Production boundary

This layer is an authorization boundary, not a complete consumer authentication product.
Before public launch, delivery of the guest token must be connected to an authenticated booking channel
(for example verified email/phone magic-link flow) with rate limits, replay controls and channel audit.
Do not place the guest access token in analytics, error telemetry, logs, or persistent browser storage.
