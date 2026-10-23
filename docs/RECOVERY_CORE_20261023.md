# Booking hold recovery, 2026-10-23

Base: `f75d817aa0c331577374926885371d9c174d79f8`. Scope: Core hold creation/recovery and the existing local gateway. This does not connect the demo ledger to Core, enable payments, or change a live database.

## Reproduced defects

Five new baseline cases failed before the fix: replay after confirmation or cancellation rejected the existing result; replay of an elapsed hold rejected it instead of reporting its current state; a revoked staff session could recover a receipt; and logout during an observed command uniqueness wait did not prevent recovery. Quote expiry after an already committed command was already supported inside Core, but the gateway rejected expired or missing session-cache quotes before reaching that recovery path.

## Contract

Initial gateway request: `POST /local-api/holds`, body `{quoteId}`, existing `Idempotency-Key` header. Every retry of an unknown attempt must send `{quoteId,recoveryOnly:true}` with the same key. The gateway also forces recovery-only when its quote cache lacks the quote. It supplies the configured property and fixed 900-second TTL; browser-supplied property/TTL and `recoveryOnly:false` are rejected.

Core serializes fresh creation and recovery on organization + create_hold + key. The original request hash remains quote ID + TTL: recovery flags, session and configured property do not change it. Recovery either reads the existing reservation or commits a `booking_commands.result_snapshot = {notCreated:true}` tombstone before returning HTTP 409 `HOLD_NOT_CREATED`. A late original request cannot create a hold using that key after the terminal absence response. No reservation, inventory, booking event or outbox event is produced for the tombstone. A different quote/TTL with that key remains an idempotency conflict.

A successful receipt includes current `status`, `activeHold`, nullable `holdExpiresAt`, reservation ID, confirmation code, total, currency and replay flag. `activeHold` is true only for an unexpired current hold; confirmation, cancellation and elapsed holds never reactivate or extend inventory. Clients must not interpret every successful replay as an active hold. The gateway forwards this receipt; the booking controller serializes bigint totals. Existing other direct callers use fresh holds; trusted signed-service callers retain registry-based authorization without requiring a browser staff session.

Workspace reads include `recoveryScope:{organizationId,userId,membershipId,propertyId}` after existing authorization. UI may persist only this scope, quote ID and key, not session credentials or guest/quote snapshots. A successful receipt or committed `HOLD_NOT_CREATED` resolves the unknown attempt; ordinary conflict/expiry/network errors alone do not establish durable absence. Recovery requires current authorized access; inaccessible or removed quotes cannot be safely resolved by this endpoint.

## Authorization and migration

Additive migration 0133 defines a read-only security-definer predicate for current staff session, credential version, user/membership status, role and property permission. It grants no new role privileges. Migrations 0001–0132 are unchanged. Fresh and cached paths reauthorize around shared serialization and after potentially blocking writes/row reads; the final failure rolls back all command, reservation and inventory writes. Replay reservation lookup is constrained by tenant and property and locks the current row.

`apps/api/db/tests/booking-hold-authorization.cjs` exports `async ({admin,runtimeUrl})`. It requires the normal disposable fixture and built API (`dist/booking/booking-hold.service.js`). Admin credentials remain outside runtime Vitest; the helper uses its own synthetic staff identity and asserts the disposable database marker. No additional environment variables or privileges are required.

## Validation

- Baseline: 5/5 new reproductions failed on the unmodified implementation.
- Targeted runtime suite: current-state recovery, expired quote, revoked session, observed uniqueness wait, durable absence, delayed original after conflict/release, simultaneous create/recover, tenant/property/role/hash negatives and gateway restrictions; existing hold suite retained.
- Administrative race proof: 14 cases revoke session, role, membership or property scope while a fresh/cached operation is observably blocked on advisory, inventory exclusion or reservation row locks. Assertions verify no unauthorized command, inventory or reservation changes.
- API build/typecheck and migration checksum verification are required before integration. Parent runs aggregate Core/upgrade/browser/Android verification on the final integrated SHA.
