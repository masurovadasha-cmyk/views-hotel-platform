# Local Core hold recovery — 23 October 2026

Base: PR #90 / `f75d817aa0c331577374926885371d9c174d79f8`.
The existing Local Core booking screen lost its in-memory idempotency key when
dates or a quote changed after an unconfirmed response. It also treated a failed
list refresh after a successful hold as a mutation failure. The recovery browser
proof reproduces the missing recovery panel on the baseline after a dropped reply.

## Bounded behavior

- Before a hold request, persist only version, quote ID, idempotency key and the
  authorized workspace scope (organization, user, membership and property IDs).
  No CSRF/session credential, guest data, price snapshot or card information is
  persisted. Scope is supplied by Core, never inferred from a selected UI role.
- IndexedDB `views.booking-recovery.v1`, store `attempts`, serializes claims by
  scope. Another tab's attempt is retained and shown for explicit recovery;
  creating a different quote cannot silently replace it. Corrupt/unsupported
  records or unavailable storage block new holds without deleting data.
- Unknown attempts lock quote inputs and the shared date picker. Retry uses the
  same quote/key even after quote expiry. Reload reads the authorized scope before
  loading its attempt; changing identity remounts the screen, and a changed scope
  clears only the previous in-memory presentation, preserving its stored attempt.
- A validated Core receipt is a confirmed operation result. List-refresh failure
  has a separate warning. Recovered cancelled, changed or expired reservations
  are not presented as newly active holds. Receipt status is not payment evidence.
- Only the definite HTTP 409 `HOLD_NOT_CREATED` response clears the attempt.
  This requires the committed Core tombstone contract, preventing a delayed
  original request from creating a hold. Other conflict responses do not prove
  that a delayed request cannot subsequently commit.
  Network failures, malformed replies, authorization failures and unknown errors
  retain the immutable attempt. Deletion is conditional on its exact quote/key.

The initial request is `POST /local-api/holds {quoteId}`. Every retry of a saved
unknown attempt adds `recoveryOnly:true` with the same `Idempotency-Key`. This
restricts retry to resolving an existing operation or committing a tombstone;
it cannot create a previously absent hold. Gateway/Core own fresh current
authorization and replay/tombstone semantics. Core workspace must include
`recoveryScope`; old or malformed responses fail closed for booking mutations.
Receipts require `status`, `activeHold`, nullable `holdExpiresAt` and replay flag.

## Evidence and limits

Typecheck and 15 focused tests (9 recovery boundaries, 6 locale tests) pass.
Independent normal-build browser proof passes RU/UZ/EN for dropped response,
expired quote, reload, denied retry, same-key terminal recovery and a failed list
refresh after confirmed success. The final protocol proof also passes all three
locales for exact initial/recovery request bodies, ordinary 409 retaining the
unknown attempt, cross-tab recovery, identity isolation, committed not-created
resolution, and corrupt IndexedDB failing closed. Final integrated CI is owned
by the coordinator; these are focused UI results, not production acceptance.

This screen uses the existing authorized local test Core. The public review/APK
does not enable Core or real booking/payment integration. Browser storage is
origin/device specific and clearing site/app data removes local recovery hints;
Core remains authoritative. Pre-upgrade attempts that were only in memory and
already lost cannot be reconstructed by this client. Market demo persistence is
a separate store and never shares its ledger with Core booking commands.
