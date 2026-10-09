# VIEWS Service Core — Stage 2.8
Status: implementation foundation, not deployed.

## Bounded contexts
Identity, Properties, Bookings, Service Catalog, Orders, Inventory, Dispatch, Payments, Finance, Audit.
The operational PostgreSQL database is the source of truth. Every row includes organization_id where appropriate. Enforce tenant isolation on the server and via database policies.

## Order lifecycle
draft -> awaiting_payment -> confirmed -> assigned -> in_progress -> completed.
Cancellation and refund are separate controlled workflows. Payment status and fulfillment status must never be conflated.

## Inventory
Stock is represented by lots with expiry, on_hand and reserved. Available = on_hand - reserved. Reserve in one transaction using row locks, FEFO ordering and idempotency key. Never reserve expired, blocked or unsuitable lots. Post a stock movement ledger entry for every reservation, release, consumption, receipt or write-off.

## Payment
Never store raw card data. Use payment provider tokens and webhook signature verification; ensure idempotent processing. Reconcile ambiguous payment outcomes before retrying.

## Events
Persist business state and outbox event in one database transaction. Workers deliver asynchronously with deduplication and retry. Track audit actor, action, tenant and timestamp.

## Canva to code
Canva is the UI specification, not the runtime. Implement responsive components from approved layouts, using live API data. Keep Vertex Taxi, Engineers and JARVIS repositories and deployments separate.

## Release gates
Migration tests, authorization tests, concurrent inventory reservation tests, payment idempotency tests, accessibility checks, smoke tests and rollback procedure required before deployment.
