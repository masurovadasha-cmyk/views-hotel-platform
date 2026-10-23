# Independent recovery QA — 0.20

Baseline `f75d817`; prior delivered release 0.19 uses sessionStorage, not durable
market storage. Lost prior tab sessions cannot be recovered by an upgrade.

Owned scope: browser proofs and synthetic storage fixtures only. Existing market,
replacement, shared-role and integrated-calendar assertions are retained while
reads/seeding and write-failure injection now exercise IndexedDB. Fault injection
uses IDB writes/transaction aborts instead of the obsolete sessionStorage write.

New durable proof covers old pending/edit migration, original source retention,
closing a page and opening another, competing confirmation in two real browser
pages, notification-driven stock refresh, transaction abort/retry, conflicting
legacy source requiring explicit archival, and corrupt durable data failing
closed. It runs RU/UZ/EN against the review build; no network mutations permitted.
Browser new-page continuity models a retained origin storage partition, not an
uninstall or guaranteed recovery after OS storage eviction.

New booking proof runs against the normal build and synthetic Core HTTP fixtures.
It drops a hold response, expires the quote, reloads, rejects one retry for current
permissions, then returns a terminal same-key receipt while workspace refresh
fails. It verifies date/quote locks, stable request identity, no false receipt on
403, explicit success-versus-refresh-failure and removal of the resolved intent.
A second tab observes the same intent without issuing a new request; actor scope changes hide it, and corrupt storage blocks new reservations without deleting the record. No real reservation, payment or live database is touched. Actual Core replay
semantics and scoped authorization races belong to the independent Core slice.

`VIEWS_JOURNEY_DIST` and `VIEWS_JOURNEY_SOURCE` select candidate build and matching
translation sources. The replacement proof retains its earlier
`VIEWS_REPLACEMENT_SOURCE` override. All Chromium launchers honor
`VIEWS_BROWSER_EXECUTABLE` with installed/bundled fallback.

Baseline durable proof fails as expected: 0.19 has no IndexedDB ledger despite
an existing session pending/edit state. Log `/tmp/views020-durable-baseline.log`.
Initial booking baseline also fails as expected: after a dropped response no recovery
panel exists (`/tmp/views020-booking-baseline.log`).

Candidate evidence: durable proof passed all three locales on clean UI commit
`b55d3098ff242c172235632d249ad854106850da`, including a throwing BroadcastChannel
notification after a successful commit and explicit focus-event fallback refresh.
A real IDB transaction abort remains a separate rollback test. Closing/reopening
pages and cross-page notifications use real browser IndexedDB, not a storage mock.

The four adapted existing proofs passed against production source `c328c15` built
with baseline `f75d817` / sourceDirty true. Existing assertions remain; tests now
await completion of asynchronous storage operations. Corrupt storage may hide
mutation controls entirely, which is asserted as unavailable rather than requiring
an empty fake basket.

Initial and expanded booking candidate proofs passed all three locales. Final wire-contract proof also passed: initial body `{quoteId}`, retries
`{quoteId,recoveryOnly:true}` with unchanged idempotency key. HTTP 403 and ordinary
409 QUOTE_EXPIRED preserve unknown intent; only a valid receipt or committed
HOLD_NOT_CREATED resolves it. The test inspects the durable attempt before every
intercepted POST and checks its fields contain no credentials. Changed scope
hides another actor's pending operation; restoring scope reveals it unchanged.
Corrupt record bytes remain unchanged while controls block.

Final booking candidate metadata remains `f75d817` / sourceDirty true. It was
built from the booking worker's final source before commit. Parent must run the
combined clean-SHA aggregate/CI and Android checks. Logs are
`/tmp/views020-booking-final.log`, `/tmp/views020-durable-final.log` and
`/tmp/views020-{replacement,demo-market,integration-journey,shared-market}.log`.

The narrow existing Windows rehearsal test now expects cache-miss recovery to
return HOLD_NOT_CREATED, checks zero reservations for that key, and verifies a
late original request cannot create one. Only its syntax was checked here: its
explicit Windows/private persistent database guards were not bypassed. Disposable
Core execution belongs to the root/Core agent. No final combined CI/APK claim.
