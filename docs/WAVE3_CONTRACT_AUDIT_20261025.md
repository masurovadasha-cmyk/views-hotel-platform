# Independent S1/P1 contract audit — 25 October

Read-only product review plus isolated QA files. Baseline Core `4b4e7c7406a2746f8a76239d6b1a589536ef62bf`; independently retested corrected Core `8bfcb324a1d6f54db4defd950362cc2f384c969c`. No shared worktree/product edits, live database, credentials, role grants, production deployment or real provider action. Disposable PostgreSQL containers were created with random ephemeral test credentials and removed by the runner; credentials are not printed or retained in evidence.

## Finding 1: ordinary 409 was not a permanent negative outcome

**Reproduced against actual PostgreSQL, not a mock.** A staff offer K receives `PARTNER_ALREADY_ASSIGNED` while assignment A is offered. The partner rejects A, without incrementing concierge source revision. A delayed copy of K then creates an offered assignment with `idempotentReplay:false`, source revision still 1. The old UI had already cleared K on the 409. This was a concrete lost-outcome safety defect.

Independent red runner: `scripts/partner-late-original-disposable.qa.cjs`, scenario `apps/api/db/tests/partner-late-original.qa.cjs`. Expected failing assertion: `UNSAFE: cleared 409 intent later creates assignment with exact same command`. Original trace is retained in `docs/qa/wave3-contract-20261025/p1-red.log`. This diagnostic deliberately lacks recovery and is **not** a default green CI test.

Corrected protocol: all ordinary errors retain the intent; explicit same-key `recoveryOnly:true` serializes with the original and persists either the applied receipt or an immutable `not_applied` fence. Both outcomes echo `commandKey`. UI clears only a validated matching-key receipt. A late original after absence fencing cannot execute. A 409 by itself still does not mean fenced absence.

To avoid duplicating the Core worker's permanent regression, the independent green runner invokes the canonical `partner-foundation.cjs` on a fresh marked database. Its assertions cover the exact 409 → fence → incumbent reject → late original sequence, zero remaining active assignments, decision absence fence, and simultaneous original/recovery agreeing on outcome. `node scripts/partner-independent-disposable.qa.cjs` **PASS** on corrected Core, 140 migrations. Evidence: `p1-green.log`.

Other 409s: revision mismatch is monotonic under existing source transitions; expiry is time-based; existing source `closed/cancelled` states cannot reopen through the current transition functions. This review does not use those observations as permission to discard unknown commands: the uniform explicit-recovery contract avoids relying on future lifecycle assumptions.

## Finding 2: wrong-command receipt and zero revision

The first proposed `not_applied` receipt lacked a command binding, so any structurally valid absence response could settle the current intent. Corrected applied/absence receipts require exact `commandKey` equality. The UI previously also accepted assignment/dispatch/decision revision 0 while Core requires 1..999999999; a malformed projection could become an invalid durable command. The corrected UI rejects it before dispatch. Empty journal counter 0 remains valid.

Independent `scripts/partner-contract-negative.qa.cjs SOURCE_CHECKOUT` produces seven negative assertions: zero assignment/dispatch/decision revision; wrong-key absence/applied; absence carrying an assignment ID; missing outcome. Positive applied/absence and empty journal counter are also checked. Original three revision failures are recorded in `p1-model-red.log`; current corrected UI candidate **PASS**, `p1-model-green.log`. Candidate source was the uncommitted `/workspace/views-roadmap-wave3-ui` model atop `ca3174264b3c06a9b4dc2cc8145cf293fd6a00bd`; final clean integrated SHA must rerun it.

## Finding 3: S1 exact-revision receipt comparison

S1 now rejects a receipt for another command and a same-applied-revision receipt with a different policy. A first implementation compared unsorted UI windows against Core's canonical sorted windows, incorrectly rejecting a valid save. Independent reversed-window intent reproduced this error. Corrected comparison canonicalizes copies of both window lists, preserves the immutable original intent, accepts equivalent order, rejects different same-version policy, and permits later current revision to differ.

`node scripts/sla-contract-negative.qa.cjs SOURCE_CHECKOUT` **PASS** against corrected UI candidate; `s1-model-green.log`. The independently checked model conditions do not replace real route/browser/IndexedDB proof.

## Reviewed boundaries and existing coverage

- S1 draft/simulate and dispatcher routes retain existing `reservation.manage` plus current actor/property/session validation; no invented partner staff role. P1 partner identity remains separate, default-off, loopback-only and disallows staff/internal/Authorization header blending. Gateway has separate cookie, CSRF and same-origin checks; no runtime credential issuance endpoint.
- Actual P1 suite independently passed revoked cached replay, eight observed lock-wait revocations, scope/PII projection, non-superuser/non-BYPASSRLS runtime, denied private-table/PUBLIC access, atomic rollback and unchanged source/stock/folio. S1 existing suite contains 16 observed command/policy-lock revocations; not redundantly rerun here because the parent owns full S1 proof.
- S1 policies strictly bound services, milestones, four timezones, 1..1440 minutes, 1..14 nonoverlapping windows, and a 366-day simulation horizon. Existing negative tests reject impossible dates, DST gaps/ambiguities, invalid boundaries, and horizon exhaustion; elapsed working minutes across DST are deliberate. These are draft simulation policies, not active deadlines.
- S1 journals contain scoped organization/user/membership/property UUIDs, command UUID, expected revision and policy; no tokens, contacts or guest PII. P1 command fields are allowlisted and namespaced by authenticated principal/grant or staff/property scope; no raw session token is persisted. Scope changes do not authorize access themselves; gateway/Core remain authoritative.
- Draft versions/command outcomes have no runtime UPDATE/DELETE grant/policy. P1 terminal absence fences are durable; there is no cleanup TTL that would permit late originals after expiry.

Remaining release gates: exact clean UI build/browser, actual integrated gateway route proof, full aggregate/CI and APK native behavior belong to release owners. No claim of production enablement, partner onboarding, fulfilment, payments, or full Canva acceptance.
