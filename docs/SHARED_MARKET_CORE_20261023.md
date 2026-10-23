# Shared market cancellation Core slice — 2026-10-23

Base: `607dc4862f43e6609746bfe70a83c94b69fcbea9` (PR #89).
Only canonical Core cancellation is changed; no alternative market architecture,
UI, production deployment or live database is introduced.

## Reproduction

On the base SHA, the new 13-case runtime reproducer failed 9 cases:

- Staff cancellation from `ready` failed `SERVICE_ORDER_TRANSITION_INVALID`:
  the fulfilment function allowed it, but the shared service-order guard rejected
  its `in_progress` to `cancelled` transition.
- Cached guest cancellation returned a receipt after logout, guest unlink or
  reservation reassignment during an observed advisory-lock wait.
- Cached cancellation bypassed reservation/profile locks; fresh cancellation could
  succeed after logout during profile, item or service-order row waits.

The pre-fix log is `/tmp/views-cancel-before.log` in the execution environment.
These are cancellation defects; replacement was already fixed by 0131.

## Bounded correction

Additive migration `0132_market_cancel_authorization.sql` adds private
`service_private.market_cancel`. Existing guest and staff dispatch wrappers route
only `cancel` to it. Other fulfilment, issue, return, proposal and replacement
paths retain their previous dispatch. Existing command payloads and receipts are
preserved, so valid historical command keys still replay.

The handler acquires the command lock and reservation/order/profile locks before
returning a cached receipt. It verifies current guest ownership and session or
staff session, membership and `stock.manage` property scope. It rechecks access
after stock and late service-order waits before committing cancellation.

Guest cancellation remains limited to `reserved`. Staff may cancel `reserved`,
`picking` or `ready`. Cancellation releases the reserve atomically with both order
statuses and one audit/outbox event; it issues no physical stock and charges no
folio. Cancellation and handover serialize on the same order and stock locks.

The shared guard gains one narrow exception: `in_progress` to `cancelled` requires
the cancellation function's owner context, the existing market execution snapshot
and a same-organization/property market row already in `cancelled`. Unrelated
service transitions remain forbidden. An explicit owner-side negative control
proves the exception cannot cancel a non-market order. Runtime cannot execute the
private handler or directly mutate protected market state.

Applied migrations 0001–0131 are unchanged. The manifest only appends 0132.

## Evidence

Dependencies: pinned pnpm 10.18.3, offline frozen-lockfile install.

Final targeted disposable PostgreSQL 16 run, exit 0:

```sh
node scripts/cloud-core-tests.cjs \
  src/service-orders/market-cancel-replay.integration.test.ts \
  src/service-orders/market.integration.test.ts \
  src/service-orders/market-replacement-replay.integration.test.ts \
  src/service-orders/market-receipt-replay.integration.test.ts \
  src/service-orders/market-issue-replay.integration.test.ts
```

- 88/88 runtime tests: 21 new cancellation tests plus 67 existing market/replay tests.
- 14 administrative revocation races: cached/fresh session, role, membership and
  property-scope revocation after command waits; fresh session/role/scope
  revocation after stock and service-order waits.
- Non-market guard negative control passes.
- API `npm run typecheck`, migration acceptance 3/3 and `git diff --check` pass.
- Final runner log: `/tmp/views-cancel-complete.log` in the execution environment.

Runtime suites and proof connections assert `views_app`, not superuser and without
BYPASSRLS. The administrative helper first checks `VIEWS_DISPOSABLE_CORE_TEST` and
creates unique synthetic actors/orders only in that disposable database. Lock
waits are observed through blocking PIDs, not assumed from sleeps. Rejections
verify unchanged order/reserve state, physical stock/movements, folio, command
records, audit and outbox as applicable.

`apps/api/db/tests/market-cancel-authorization.cjs` exports
`async ({admin, runtimeUrl})`; `admin` is the existing disposable owner pg.Client,
`runtimeUrl` belongs to restricted views_app. `scripts/cloud-core-tests.cjs` invokes
it only after successful Vitest, outside dev mode. It requires all migrations,
normal Core workflow seeds, `service-orders.synthetic.sql` and
`market.synthetic.sql`; it does not depend on Vitest-created orders. No owner
connection string is injected into runtime Vitest. Production Core CI integration
is owned by the parent integration branch.

Full aggregate checks, complete Core suite and exact-SHA CI belong to the parent
integration run. This slice makes no claim of live external synchronization,
physical delivery, real payments or a new APK. No live data, credentials or
production settings changed.
