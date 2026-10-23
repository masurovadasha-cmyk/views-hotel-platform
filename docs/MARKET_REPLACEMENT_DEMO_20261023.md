# Atomic replacement of a local demo market order

Base: `24137758f9e94247375d906d4f6746c80b5e14ee`. This slice extends the existing per-tab demo reducer, not the Core API or real inventory.

A reserved demo order can be edited only when the unrelated shopping basket is empty and no confirmation or other edit is active. Editing copies its lines and keeps the original reservation. Cancel editing discards only this edit basket; Back to basket cancels review and keeps the edit. Draft and pending confirmation survive reload under the existing `views.demo-market.v1` key. Legacy v1 data requires no destructive migration.

Review and confirmation check available units plus the edited order's own held units. Confirmation performs one storage write: old order becomes cancelled, its `replacedByOrderId` points to the new reserved order, and the successor's `replacesOrderId` points back. No other order's reservation is credited. Repeated review retains its token and repeated confirmation cannot duplicate an order. Storage failure leaves the original reservation and pending token intact. Persisted invalid or cyclic links fail closed without resetting data. History mutations are blocked during an edit. Replacement chains remain readable and accounted for.

The existing Core market already implements replacement; no duplicate API, migration, or production integration is introduced. This demo still has no prices, payment, delivery or real stock movement. RU/UZ/EN, UZS and existing images remain intact.

Validation: TypeScript check and 23 demo-market unit tests passed, including legacy v1, draft/review reload, own-held credit, shortage, stale target/token, repeat confirmation, cancel editing, replacement chains, malformed backlinks and storage failure. Independent browser QA is owned by the integration QA stream; overall aggregate CI, APK and preview evidence belong to the integration release report.

Deferred: Core catalog/list response parser hardening (detail already has a bounded parser). This independent boundary concern is not required to introduce local demo replacement and should be a separate change.
