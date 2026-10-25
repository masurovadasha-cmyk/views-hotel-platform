# M2: atomic replacement of private market lot reservations

Base: `68139ef`; additive migration 0136. Migration 0135 belongs to the independent owner slice and is intentionally absent from this isolated test branch; the disposable runner applies the available migration files in sorted order. No temporary manifest was needed or committed. The integrator must append 0136 after 0135 and run aggregate upgrade acceptance. Migrations 0001–0134 are unchanged.

## Reproduced defect and contract

On the M1 baseline, replacing an order carrying an active private lot reservation failed at commit with `LOT_RESERVE_ACTIVE`. Existing replacement created a successor and cancelled the original but did not release its lot rows. The deferred terminal guard correctly rejected that inconsistent transaction.

0136 replaces only `service_private.market_replace`. After existing guest ownership/session/revision checks and sorted old/new stock union locks, it releases active original lot rows constrained by order, organization and property. Existing cancellation and nested `app.market_request` then produce the successor. Any price/catalog/stock rejection, authorization failure or transaction rollback restores the original order and all original lot holds. Late session checks, row locks, command payload and replay semantics are preserved.

The successor has its own current price snapshot and ordinary stock reservation; it receives no implicit lot selections. No physical issue, folio entry, payment or refund is generated. The original remains immutable cancelled history, with one `replaces_order_id` successor. Same-key replay does not create another successor or rewrite release timestamps. A competing cancel or replacement is serialized by existing stay/order locks.

Runtime lot activation stays disabled. M3 lot-aware handover remains separate; neither a new route nor runtime grant is introduced here.

## Proof

`scripts/market-lot-replacement-proof.cjs` is invoked from the existing disposable lot harness after M1 and its fixture cleanup. Owner-only setup inserts the private lot hold; all guest create/replace/cancel calls use `SET LOCAL ROLE views_app`.

Coverage: real quantity/price-changing successor; original release and exact logical reserve accounting; same-key concurrent replay; changed payload conflict; nested price failure; explicit rollback; catalog from another tenant; current guest session revocation after observed command/item/lot waits; fresh and cached ownership withdrawal after observed command waits; two competing replacement keys and replacement versus cancellation. It asserts original/hold/command state, successor cardinality, unchanged physical stock/movement count and zero folio entries.

The pre-existing M1 concurrent handover assertion now also recognizes `SERVICE_STOCK_RESERVED`: when handover reaches the ordinary stock guard first, that is another legitimate rejection. Its cancellation-success, released-hold, unchanged-stock and zero-folio assertions are unchanged.

These are backend invariants supporting Canva market IDs, not full visual acceptance or activation of private lot reserve. No live database, production credentials or external service is involved.

Executed: `node scripts/cloud-core-tests.cjs src/service-orders/market` — seven files / 105 tests PASS, private lot foundation/command/M1/M2 proofs PASS, existing cancellation authorization 14 races PASS, hold authorization 14 races PASS; API rebuilt by the harness. Evidence logs: `/tmp/views-m2-before.log` and `/tmp/views-m2-final.log`. Final integrated SHA still requires the parent's full suite and sequential migration/upgrade checks including 0135.
