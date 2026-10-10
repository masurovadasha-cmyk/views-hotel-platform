# Stage 5.21 — Cleaning and laundry workflows (development)

Implemented transactionally in `src/cleaning-laundry.mjs`:
- Dispatcher initializes a unique checklist on an eligible cleaning task.
- Only the assigned worker may mark checklist items while the task is in progress.
- Cleaning completion requires all checklist items to have actor and completion time.
- Laundry bags can be registered only for a laundry service order by a property manager.
- Each laundry custody transition is validated and recorded in an append-only event table.
- Only property managers or assigned active laundry workers may advance a bag.
- Events are emitted to the transactional outbox for later notifications and analytics.
- The generic staff completion route cannot bypass the cleaning checklist or laundry custody workflow.

API endpoints (developer only):
- `POST /api/v1/cleaning/checklists`
- `POST /api/v1/cleaning/items/complete`
- `POST /api/v1/cleaning/finalize`
- `POST /api/v1/laundry/bags`
- `PATCH /api/v1/laundry/bags/:id/status`

Not production-ready: creation of paid cleaning/laundry service orders, verified guest consent, photo proof, quality review, linen inventory, payroll calculation, staff task-kind-specific custody verification, SLA escalation and refunds are not yet integrated. Do not expose these development routes publicly.

CI integration tests require PostgreSQL 16, tenant RLS and migration 0015.

Staff UI: `/staff` now opens the assigned cleaning task checklist, lets the worker confirm individual items, and offers completion only after all items are recorded. The server rechecks all items and assignee identity transactionally. The laundry workflow is API-only; no dedicated laundry custody screen is implemented yet.
