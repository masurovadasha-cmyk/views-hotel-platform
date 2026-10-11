# Stage 7.21 — bounded Payme expiry maintenance

## Scope

This layer adds an executable, one-shot expiry worker to the same Core and
repository. It does not enable a real merchant, publish an HTTP administration
endpoint, schedule a cron job, update the review APK or deploy production.
The sandbox provider remains opt-in, with production provider mode rejected.

Payme's documented timeout is 12 hours / 43,200,000 ms from its transaction time;
unperformed transactions become -1 with reason 4. Stage 7.20 already performed
this transition lazily during lifecycle RPCs. This stage also handles a customer
who abandons checkout and never triggers another provider callback.

## Worker

PaymeExpiryWorkerService.runCycle defaults to 50 candidates and a 10-second
cooperative processing budget, with hard limits of 100 candidates / 30 seconds.
The scan is scoped to the configured merchant organization and only state=1
transactions older than the deadline. Migration 0038 adds a partial scan index.
Each candidate gets its own transaction so failure rolls back that candidate's
provider state, payment, booking, inventory and outbox changes together.

The worker reuses PaymeMerchantApiService's expiration implementation instead
of duplicating its state machine. Advisory try-lock -> payment intent lock ->
reservation lock follows the existing lifecycle order. Row locks use SKIP LOCKED.
Busy rows are deferred rather than blocking an active payment or cancellation.
Rechecking state after locking protects against concurrent workers and RPCs.

Captured/refunded amounts and incompatible booking/payment states cause a
conflict report, not a fabricated refund or forced cancellation. The same
invariant is now checked by lazy RPC expiry. Existing posted transactions and
other organizations are not scanned. No external provider call is made by the
worker, and no capture/refund ledger posting belongs to an expiry operation.

Reports contain aggregate counts only: candidates, expired, unchanged, busy,
conflicts, failed, budgetExhausted, hasMore and elapsedMs. No merchant keys,
raw SQL, customer data or arbitrary request/response bodies are printed.

## Explicit entry point

After building Core, on an approved staging runtime with its normal secrets:

```sh
node dist/payments/run-payme-expiry.js --ack=STAGING_EXPIRY_ONLY --limit=50
```

This starts a Nest application context without a network listener, executes ONE
cycle and closes the context. Missing acknowledgement/invalid input fails.
Disabled sandbox configuration exits without touching the database. Conflicts,
errors, busy rows or an exhausted budget produce a nonzero exit for the caller.
No timer or background work is activated by this PR.

## Actual regression coverage

The existing real-HTTP lifecycle proof is reused, including parallel create,
perform, cancel and injected rollback checks. Ten additional scenario groups
exercise the compiled worker against PostgreSQL with the restricted views_app
role: bounded scans, future/paid/foreign records, repeated and parallel cycles,
held advisory/intent/reservation locks, failure rollback, inconsistent financial
state, racing late Perform and disabled/invalid/valid CLI runs.

The old Stage 7.19 shell proof is also corrected: docker exec now forwards stdin
with -i, and two malformed DO dollar-quoted blocks are repaired. Previously a
psql process could exit zero without executing its input. Earlier green runs
from that broken harness must not be cited as database proof. Stage 7.20's Node
integration independently exercised those assertions; this workflow additionally
reruns the repaired standalone SQL harness before the payment/expiry proof.

CI applies all ordered migrations through 0038 and also wires 0038 into the
Production Core workflow. It checks current source SHA and requires measured
expiry evidence, not merely an uploaded file or a successful shell exit.

## Remaining operational limits

The time budget is cooperative between candidates, not a hard wall-clock cutoff
for DB connection acquisition. PostgreSQL statement and lock timeouts bound
statements; connection pool/infrastructure deadlines remain a wider Core task.
Persistent conflicts can recur at the front of a batch and require operator
reconciliation; this is reported rather than silently skipped as success.
The scan is one configured merchant tenant, not cross-tenant payment operations.
A persistent scheduler, alert routing and real Payme sandbox certification still
need a staging runtime and separately approved activation. This stage does not
close the existing Cloudflare Workers build failure.

## Primary sources checked 2026-10-06

- https://developer.help.paycom.uz/metody-merchant-api/createtransaction/
- https://developer.help.paycom.uz/pesochnitsa/
- https://www.postgresql.org/docs/16/explicit-locking.html
- https://docs.docker.com/reference/cli/docker/container/exec/
