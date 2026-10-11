# Stage 7.20 — actual Payme lifecycle and atomicity proof

## Scope

This is a sandbox-only Merchant API adapter. No external Payme sandbox call,
real merchant account, PAN/CVV handling, production transaction or new cloud
resource is introduced. The published web/APK review remains unchanged.

## Defects found in earlier acceptance harnesses

The old shell scripts fed SQL through `docker exec ... psql <<SQL` without `-i`.
Docker did not forward standard input. A psql process could exit zero without
executing a single seed or assertion. This also invalidates the earlier Stage
7.19 evidence as proof of its SQL assertions: a green workflow alone is not
sufficient evidence of database behavior.

The replacement test connects through node-postgres from a disposable test
subprocess, measures real database rows, sends actual HTTP requests to the Core,
and rejects missing/empty evidence. Only the test subprocess receives the
synthetic owner connection for seeding and controlled failure injection. The
running Core retains the restricted `views_app` role.

The new test additionally executes Stage 7.19's begin/complete, replay denial,
direct-write denial, tenant isolation, stale recovery, claim/resolve/retry and
safe outbox count assertions against the actual database. Results are to be
reported only after the dedicated workflow succeeds.

## Atomic payment lifecycle

Previously the payment inbox/ledger could commit before the Payme transaction
state was updated in another transaction. A crash or simultaneous cancellation
could leave inconsistent states. The adapter now owns one organization-scoped
transaction and passes that SAME PoolClient into the existing payment pipeline.
The provider state, inbox, capture/refund ledger, reservation and inventory either
commit together or roll back together. The existing non-Payme entry point still
opens its own tenant transaction and delegates to the same implementation.

An advisory transaction lock serializes the same Payme transaction ID. Intent
and reservation row locks serialize two different transaction IDs for one order.
Canonical financial event identity excludes the RPC request ID and whitespace;
retries return the original persisted provider timestamps and state.

## Protocol decisions verified against official documentation

Merchant API is inbound JSON-RPC with Basic authentication and source-IP checks,
not a generic signed webhook invented by VIEWS. IDs, account, amount and provider
transaction time are validated. Both `text/json` and `application/json` receive
bounded raw parsing so invalid JSON returns a protocol error with HTTP 200.

The transaction timeout is 43,200,000 milliseconds (12 hours). Create reserves
the booking until that deadline. Expired unperformed transactions are lazily
cancelled with reason 4 on the relevant lifecycle calls. The cancellation and
error response are committed together. This is NOT a claim that a background
expiry worker or full external certification is already active.

GetStatement uses the provider creation time, inclusive bounds and ascending
order. Cancelled transactions are included. No fabricated pagination or
truncation is added. Automatic merchant-initiated refund submission remains
unsupported; CancelTransaction is an authenticated inbound provider operation.

## Proof cases

- Restricted role and forced RLS are verified from PostgreSQL metadata.
- Parse/auth/account/amount/unknown-method failures over actual HTTP.
- 12 simultaneous Create calls create one transaction and identical results.
- 10 simultaneous Perform calls create exactly one capture and confirmation.
- 10 simultaneous Cancel calls create exactly one refund and inventory release.
- A concurrent Perform/Cancel race leaves only a legal terminal financial state.
- An uncaptured cancellation never creates financial entries.
- An expired transaction becomes -1/reason 4 without a capture.
- A controlled error after ledger posting but before provider state storage
  rolls back all payment/booking records; a subsequent request succeeds once.
- A controlled error during refund has the same atomic rollback property.
- Checked-in service cancellation is denied.
- A composite tenant FK rejects cross-tenant payment references even for owner
  writes; the runtime cannot see another organization's provider rows.
- All posted journals balance; Stage 7.19 durable audit assertions really run.

Migration 0037 adds composite tenant binding, exact account binding and state
invariants without rewriting the existing 0036 migration. The disposable proof
applies all ordered migrations. The older Production Core workflow's explicit
list must also include 0037 before production acceptance; this stage does not
represent a production deployment.

## Primary sources

- https://developer.help.paycom.uz/protokol-merchant-api/skhema-vzaimodeystviya/
- https://developer.help.paycom.uz/metody-merchant-api/createtransaction/
- https://developer.help.paycom.uz/metody-merchant-api/performtransaction/
- https://developer.help.paycom.uz/metody-merchant-api/canceltransaction/
- https://developer.help.paycom.uz/metody-merchant-api/getstatement/
- https://developer.help.paycom.uz/pesochnitsa/

External sandbox certification still requires a real Merchant ID, assigned login,
TEST_KEY and persistent HTTPS endpoint. None is invented or activated here.
