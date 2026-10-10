# Stage 5.2 — Verified Guest Auth Exchange

Status: provider-neutral foundation.

## Goal

Do not make a staff-created long-lived guest bearer token the public delivery mechanism.
A verified delivery adapter sends a short-lived one-time exchange token. The guest exchanges it
once for the reservation-scoped `vga_` access token introduced in Stage 5.1.

## Secret handling

Two different opaque secrets exist:

- `vge_` — one-time exchange token, intended for a verified email/SMS delivery channel.
- `vga_` — reservation-scoped guest access session token.

Rules:

- raw `vge_` is never returned by the staff challenge endpoint;
- raw `vge_` is never persisted;
- raw `vga_` is returned only once after a successful exchange;
- PostgreSQL stores only SHA-256 hashes of both tokens;
- challenge destination is stored as SHA-256 in the challenge table;
- arbitrary provider metadata is not persisted;
- provider failures are persisted only as normalized error codes;
- tokens and destinations must never be written to logs, tracing, analytics or error telemetry.

## Provider boundary

`GuestAuthDeliveryPort` supports:

- email
- sms

The registry is truthful: no provider is reported or used unless a real adapter has been registered.
The repository does not ship a fake production email/SMS provider.

Delivery receives the raw one-time token only in memory:

```text
staff -> create challenge -> delivery adapter -> verified channel -> guest
guest -> exchange once -> vga_ session
```

## API

Staff:

`POST /v1/guest-auth/challenges`

Body:

```json
{
  "reservationId": "<uuid>",
  "channel": "email",
  "ttlMinutes": 15
}
```

The response contains challenge ID, channel, delivery status and expiry. It never contains the raw exchange token.

Public:

`POST /v1/guest-auth/exchange`

Body:

```json
{
  "token": "vge_<opaque>",
  "sessionTtlMinutes": 1440
}
```

A successful response returns one new `vga_` token. The challenge is atomically marked consumed.
A replay, expired challenge, undelivered challenge or malformed token is rejected.

## Database

Migration:

- `apps/api/db/migrations/0012_guest_auth_challenges.sql`

Adds:

- `guest_access_challenges`
- `app.exchange_guest_access_challenge(...)`
- hardened `app.resolve_guest_access_session(...)`

Challenge exchange is atomic at the database boundary so concurrent replay cannot mint two sessions.

## Authorization

Challenge creation remains staff-only and requires:

- active host / owner / manager / front_desk membership;
- tenant match;
- property access;
- confirmed or checked-in reservation;
- a valid destination attached to the primary guest profile.

The public exchange endpoint accepts no organization, user or staff membership headers.

## Automated verification

`guest-auth.integration.test.ts` verifies:

- raw exchange secret is not returned or persisted;
- challenge destination is hashed;
- delivery state is explicit;
- one-time exchange creates a reservation-scoped session;
- replay is rejected;
- malformed tokens are rejected;
- an unconnected provider fails truthfully without creating a challenge;
- exchange emits an auditable outbox event.

## Remaining production work

Before public launch:

- connect approved email/SMS delivery adapters;
- add distributed rate limits for challenge creation and exchange;
- redact authorization/token-shaped values from HTTP and error telemetry;
- define channel bounce/failure operational alerts;
- add verified email/phone update/recovery workflow;
- run abuse tests for enumeration, replay and brute force.
