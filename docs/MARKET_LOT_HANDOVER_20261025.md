# M3: exact private-lot handover

Base `e058f84`, additive migration 0137 for the next review milestone. Migrations 0001–0136 remain unchanged. No runtime lot-reservation activation, new route, grant, provider or live database change.

## Defect and contract

On the M2 baseline a valid handover with active private lot holds failed at commit with `LOT_RESERVE_ACTIVE`. An issue could also be rejected by stock guards because its own unreleased hold remained in the reserved quantity. The terminal guard correctly refused to commit an inconsistent order.

0137 adds a dedicated private `market_handover` and routes only the existing staff handover action through it. Existing manual handover without private holds retains its optional selection contract (both snapshot-only and movement-version provenance). Other fulfilment actions retain their dispatch paths.

When any active private hold exists, all order lines must be held, with exact quantities. Each line requires an explicit selection matching its immutable service/item mapping, held lot/date/movement, current reconciled projection and source snapshot. Stale versions fail closed: release/reselection must be explicit, never silent FEFO or automatic version substitution. Partial holds, missing/mismatched selections and extra allocation fields are rejected.

Under existing command/stay/order locks and sorted item locks, active hold rows are locked and current staff/session/property authorization is rechecked. Only the consuming order's holds are released, then its ordinary reserve is removed by the handed-over transition, and exact line quantities are issued through the existing stock/expiry/projection/ledger guards. Any failure rolls back releases, stage, physical movements, ledger/projection, audit and command state together. Final authorization runs after recording the command. Cached replay checks current access after waits and never releases or issues twice. Handover creates no guest charge; separate receipt consent remains required.

## Terminal paths

- Guest/staff cancel: 0134 releases active holds.
- Direct replacement: 0136 releases the original holds and creates one successor without inherited selections.
- Acceptance of a warehouse proposal calls the same `market_replace` implementation (0087); it therefore uses 0136.
- Staff handover: 0137 consumes the explicitly selected provenance and releases all own active holds.
- Guest confirmation requires `handed_over`; holds have already been consumed/released. Returns, inspection, restock, discard and credits start after handover/completion and introduce no private holds.
- `reopen_picking` returns to a nonterminal reserved state without changing line quantities. Explicit private `release_lots` still releases without consuming stock. Neither path authorizes implicit allocation.
- Legacy private fulfilment functions remain inaccessible to runtime callers. The deferred terminal guard remains in place as a final invariant.

## Evidence

`scripts/market-lot-handover-proof.cjs` runs in the existing marked disposable lot harness. Owner setup creates private holds; actual handover/cancel/replay commands run as `views_app`. It tests two-line release and exact per-lot net balances/provenance, one issue per item, no folio, concurrent same-key replay, changed payload denial, whole-transaction rollback, missing/wrong/duplicate/foreign selection, partial holds, immutable quantity, stale projection, and actual expiry at a disposable property timezone boundary. The expiry test places the expired item second in lock order, proving rollback of an earlier valid issue. It also covers current session/role/property revocation after observed advisory/item/lot waits, legacy three/four-field provenance, and competing handover/cancel commands.

M1's deliberately unselected handover contender now recognizes `LOT_RESERVE_MISMATCH` as the explicit failure under the new private-hold contract. Its assertions about cancellation, release, physical stock and folio are unchanged. No acceptance assertion was removed or replaced with a timing delay.

Runtime reserve stays closed pending separate API/UI policy and end-to-end activation review. This backend work does not constitute Canva Light/Dark acceptance.

Executed final scoped command: `node scripts/cloud-core-tests.cjs src/service-orders/market` — exit 0; seven files / 105 market tests PASS; private lot foundation/command/M1/M2/M3 proofs PASS; cancellation authorization 14, hold authorization 14 and owner calendar authorization 10 observed-wait cases PASS. The harness rebuilt API successfully. Baseline `/tmp/views-m3-before.log`; final `/tmp/views-m3-final.log`. Full integrated CI and sequential upgrade acceptance remain the release integrator's checks.
