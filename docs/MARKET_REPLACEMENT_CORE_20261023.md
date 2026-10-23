# Core market replacement authorization — 2026-10-23

Base: `24137758f9e94247375d906d4f6746c80b5e14ee` (integration PR #88).
This increment ports the access-before-idempotent-replay invariant discussed in
historical #58–62 into the existing canonical Core contract. It does not merge
the alternative market tables, migrations, gateway, or UI from those branches.

## Existing contract retained

`POST /v1/guest-identity/email/services/market/:id/actions`, with guest session and
idempotency key, accepts `replace_order`, `expectedRevision`, replacement `lines`
and string `expectedTotalMinor`. Only the guest can consent. A reserved order is
cancelled atomically and linked to one new immutable reserved successor; its
accepted snapshot remains in history. Own reserved stock is reusable, the union
of old/new stock is locked in deterministic order, and failed price/stock checks
roll back cancellation. Replacement neither issues physical stock nor charges a
folio. Concurrent identical commands return one successor; changed payload with
the same command key conflicts. Existing market integration tests already prove
these properties, including races against picking and another guest's reserve.

Public demo replacement follows this behavior locally; this document does not
claim the demo uses live Core, external payments, or an operational warehouse.

## Reproduced defect and bounded correction

The sole `service_private.market_replace` definition was migration 0085. Its
`service_command_replay` acquired an advisory lock and could return a cached
receipt after the caller lost access while waiting. Unlike newer receipt/issue
handlers (0125/0126), replacement did not recheck current authorization before
returning that receipt.

Before correction, the new 12-case disposable regression produced 5 failures:
three returned cached receipts after logout, profile unlink, or reservation
reassignment during an observed advisory-lock wait; two cached paths bypassed
reservation/profile locks entirely. Seven other cases passed. Evidence captured
in `/tmp/views-replacement-before.log` in the execution environment.

New additive migration `0131_market_replacement_authorization.sql` explicitly
acquires the command lock, locks the reservation/order/profile, and checks current
ownership/session before replay. It rechecks session after stock locks and late
nested request/order-row waits. Existing payloads, successor links, lock order,
private privileges, and mutation semantics remain unchanged. Applied migrations
0001–0130 are untouched; the checksum manifest only gains 0131.

## Reproducible checks

Dependencies were installed offline using pnpm 10.18.3 with frozen lockfile.
Run from repository root:

```sh
node --test scripts/integration-schema.acceptance.cjs
node scripts/cloud-core-tests.cjs src/service-orders/market-replacement-replay.integration.test.ts src/service-orders/market.integration.test.ts
```

Run `npm run typecheck` in `apps/api`.

The new suite requires database marker `VIEWS_DISPOSABLE_CORE_TEST` and checks
that runtime is `views_app`, not superuser and without BYPASSRLS. Lock races are
observed via PostgreSQL blocking PIDs, not inferred from sleeps. Rejections assert
unchanged original order, successor set, stock, movements, folio entries, audit
and outbox counts. Coverage includes cached/fresh revocation after command lock,
stay/profile waits, fresh stock/order waits, exact authorized replay, conflicting
payload, a single successor, large minor-unit strings, and private EXECUTE denial.

Final worktree checks passed: 38/38 disposable PostgreSQL tests (24 existing market
plus 14 replacement regressions), 3/3 migration acceptance checks, API typecheck
and `git diff --check`, all exit 0. Post-fix runner log is
`/tmp/views-replacement-after.log` in the execution environment.

Only the selected suites are this worktree's evidence. The parent integration
branch runs aggregate checks, full Core suite and exact-SHA CI separately. No live
database, external provider, real payment, credentials or production changed.
