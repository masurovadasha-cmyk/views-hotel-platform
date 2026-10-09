# V-Market demo integrity — 2026-10-09

Base: `review/web-apk-20261006` at `7105b9673927af0f8d8d660798a1f11a441dd447`.
Original model blob: `bf7d2088920057bf77beeb97a19db6e38f948ab7`.

This modifies the existing market model; there is no new repository, second order engine, schema migration, dependency, provider or release.

## Changes

- Require positive safe-integer cart quantities, known product IDs, valid delivery/payment metadata and nonnegative safe-integer UZS amounts. Reject arithmetic overflow before any reservation.
- Compare same-key retries with the original cart, delivery details, comment, payment method and delivery fee. Changed requests fail with `IDEMPOTENCY_CONFLICT`. Reordered cart keys are equivalent. Replays return original prices and do not reserve again after delivery/cancellation.
- Generate order IDs unique within the supplied demo state even under a frozen millisecond clock. Reject a caller-supplied ID already used by another order.
- Reconcile product reservations against every active order before mutation. Invalid totals, missing products, duplicate IDs/SKUs/order lines and invalid active states stop the mutation instead of being silently clamped.
- Refuse invalid receiving/adjustment quantities and overflow. Preserve the existing explicit adjustment floor at reserved stock.
- Keep cancellation separate from payment: cancelling releases inventory only; it does NOT claim a refund or erase a room charge.

## Reproduce

With existing project dependencies installed:

```sh
node --test scripts/market-integrity.regression.cjs
```

The script compiles the actual TypeScript module with strict checking into a temporary CommonJS directory, runs native Node assertions and removes the directory. It does not replace the model with a mock. VIEWS CI now runs this test after the retained application suite.

Local red/green evidence: 55 cases; original model 14 pass / 41 fail; changed model 55 pass / 0 fail. These are test cases, not 41 independently classified defects. The first 112 source lines, including all catalogue references, photo URLs and markup, are byte-for-byte unchanged. Prices and image rights were not re-verified here.

## Boundaries

This remains a single-browser, localStorage-based demo. These synchronous functions do not provide cross-tab/device locking, a server transaction, real inventory or production authentication. No live payment/refund, external communication, deployment, Android signing or user-computer update is performed by this change. localStorage hydration/error recovery, staff-facing conflict messages, concurrent tabs, actual refunds and a shared backend remain separate work. Full application/CI/browser/device results must be reported separately; the local report proves only this actual domain module and the regression suite.
