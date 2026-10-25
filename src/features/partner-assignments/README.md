# P1 partner coordination UI — partial SP-GN-001 / 002 / 006

The three bundled Canva references were inspected. This slice implements a minimal synthetic concierge offer/inbox/accept/reject workflow. It does **not** import the references' taxi identity, guest money, payouts, driver role, real deliveries, fulfilment, onboarding or invitation claims. These screen IDs remain partial pending integration/design acceptance. The proof harness is not an authenticated application or a public demo route.

## Root integration contract

Exports from `PartnerAssignments.tsx`:

- `PartnerDispatch({locale, session: {scope, propertyId} | null, api: PartnerDispatchApi | null, onUnresolvedChange?})`
- `PartnerAssignments({locale, session: {scope} | null, api: PartnerAssignmentsApi | null, onUnresolvedChange?})`

`scope` must be an opaque stable identity derived from the authenticated gateway principal/grant (and property for dispatch), never a role dropdown or guessed user. Components namespace journal keys by mode and property. Keep the resulting scope at most 200 characters. `session=null` or `api=null` renders the disconnected panel and makes no requests. Separate authenticated local wrappers must provide these values. Component props are not authorization; gateway/Core independently enforce it.

Inject adapters implementing the exported interfaces in `model.ts`. Dispatcher adapter: `list(propertyId, after?)`, `offer(body, key)`. Partner adapter: `list(after?)`, `decide(assignmentId, body, key)`. Root supplies same-origin gateway paths, existing authenticated cookies, CSRF, `Idempotency-Key`, and separate partner/staff session boundaries. Never pass a raw partner token or put one in this journal. Adapters throw `PartnerApiError(code, status)` for structured Core errors. Other exceptions are conservatively unknown. List/receipt projections are validated and copied through an allowlist, excluding extra PII/money fields.

Core contract agreed with `dependency_review`, final Core commit `348437404fe910f2765ca19a2e8585a643322272`:

- `/v1/partner-dispatch?propertyId=UUID&after=UUID`: minimal eligible concierge orders, `grants`, `grantsTruncated`, `nextCursor`.
- `/v1/partner-dispatch/offers`: `{orderId,grantId,expectedOrderRevision,expiresAt}`.
- `/v1/partner-assignments?after=UUID`: minimal assignments with revision, terms version, synthetic flag and dates.
- `/v1/partner-assignments/:id/decisions`: `{action:accept|reject,expectedRevision,termsVersion:1}`.
- Mutations return the **current** assignment receipt and `idempotentReplay`. A replay may now be accepted/rejected/expired; UI displays that returned state without pretending the original action just executed.

Expiry is explicitly entered in the displayed browser timezone and converted to ISO; no SLA is invented. Server limits remain authoritative. Truncated grants are visibly disclosed as an incomplete list. All acceptance is labelled synthetic coordination, never execution/payment/delivery.

## Recovery and safety

A dedicated IndexedDB database `views-partner-intents`, store `commands`, stores one versioned active minimal command per scope. Commands contain only UUID identifiers, revisions, action/expiry/terms and their idempotency UUID. They contain no access tokens, card data, guest messages or money. Existing demo databases and saved records are untouched.

The serialized read/write transaction reserves an intent by expected journal revision **before POST**. A competing tab cannot reserve a different active intent. Unknown/corrupt versions, storage errors or quota failures block sending without resetting records. The journal survives browser restart. Reload/reconnect/scope changes never automatically send commands. Same-key recovery reuses the exact stored body, identifiers and revision.

Unknown responses, network errors, authentication failures, malformed receipts and **all 409 conflicts** retain the journal. A transaction rollback is not a durable command tombstone: a delayed original could become eligible after another assignment changes. The client therefore does not clear an intent on these errors. Recovery sends the same stored command/key with recoveryOnly:true. Core either returns the applied current receipt or durably fences an absent command with outcome:not_applied; only these validated receipts settle it. A delayed original cannot execute after the not_applied fence. Revoked or inaccessible scopes remain blocked without an unsafe discard or automatic resend. If settlement storage fails, the journal remains recoverable.

Changing scope clears visible cached cards, review and receipts; the old scope's journal remains intact. Returning to that authenticated scope reloads it. `onUnresolvedChange` lets the parent navigation guard track active/pending writes; supply a stable callback. Native beforeunload additionally protects pending commands. Cancel is available only before sending. After unknown result the UI offers recovery, never a misleading discard/new-key shortcut.

## Verification

From repository root:

```
npm run typecheck
npx vitest run src/features/partner-assignments/model.test.ts
node src/features/partner-assignments/browser.cjs
```

The browser runner builds the isolated `proof.html`/`proof.tsx` entry into a temporary directory, serves it only on loopback and intercepts all fixture requests. It uses a newly created disposable browser profile, never an existing user profile. Its adapters are synthetic fixtures, not authentication or Core integration evidence. The normal application build does not import this entry.

Coverage: safe Cancel, two-tab CAS, response lost after committed mutation, full browser restart, same-key retry, scope isolation, offline blocking, current receipt, RU/UZ/EN/light/dark/mobile, dispatcher review, corrupt journal, quota-before-POST, retained rollback conflicts and authentication failure. Root remains responsible for gateway wiring, actual authenticated Core integration, navigation guard, Android upgrade/restart, aggregate CI and final artifacts. No production readiness is claimed.


## Integrated local routes (wave 3)

`?api=local-core&portal=partner` on the existing allowed loopback origin opens a separate partner gate. Its read-only `/partner-api/session` uses the dedicated HttpOnly cookie and `X-Views-Partner-Pilot: 1`; no login, token entry or credential persistence is implemented. Missing, expired or malformed sessions remain disconnected. `?api=demo&portal=partner` is a public disconnected panel with no runtime API requests. Partner is never a staff role.

Authenticated staff with `reservation.manage` can explicitly open dispatch or SLA from the existing staff workspace. The wrapper derives identity and property from the validated current `/local-api/workspace`, never from URL role labels or a hardcoded property. Staff adapters use the existing same-origin cookie/CSRF boundary. Pending writes prevent module/account/native navigation; beforeunload also protects unresolved commands. Reload only reads the scoped journal and never sends automatically.

Both receipt outcomes must echo `commandKey` matching the active intent. Revisions in service projections and commands must be 1–999999999; the separate journal counter may start at zero. Contract tests exercise bound receipts and the recovery-only delayed-original fence. Route-level browser fixtures prove application wiring, not production access or actual Core authorization; the separate disposable Core HTTP/SQL proof is required for that claim.
