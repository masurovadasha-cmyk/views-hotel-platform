# V-Market inventory persistence — Stage 7

Migration 0037 adds tenant/property-scoped stock balances and an append-only movement ledger to the existing VIEWS API database. It deliberately does not enable writes or public endpoints.

**Invariants:** nonnegative stock and reservations, reserved <= on_hand, version >= 1, unique (organization,property,sku), scoped movement foreign keys, and movement sign constraints. RLS is forced on both tables. Read policies require both an approved role and property access; movements inherit visibility through their parent balance. A trigger rejects cross-tenant property assignment.

**Not yet implemented:** stock checkout transaction, row locking, atomic reserve/release/sale, purchase receiving, command idempotency, audit/outbox, authenticated guest endpoints, role-based staff mutation and browser-to-server migration. A future transaction must lock the balance row and verify available=on_hand-reserved before incrementing reserved and appending the ledger movement. Delivery must decrement on_hand and reserved once; cancellation must decrement reserved once without refunding money. Tests must prove two concurrent requests cannot oversell. No migration is applied to production by this PR.
