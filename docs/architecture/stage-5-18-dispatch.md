# VIEWS Stage 5.18 — Dispatch & staff execution (development)

## Scope
- Dispatcher queue: `GET /api/v1/dispatch/tasks`, filtered to properties with explicit `order:manage` grant. Admins can view organization-wide.
- Assignment: `POST /api/v1/dispatch/assign`, requires dispatcher/admin role and property grant.
- Eligible workers must exist as active `service_task_assignees` for the property.
- Staff queue: `GET /api/v1/staff/tasks`, returns only the authenticated principal's tasks.
- Staff transition: `PATCH /api/v1/staff/tasks/:id`, assigned → in_progress → completed, only by active assignee.
- Order cancellation closes outstanding tasks in the same transaction as inventory release and order audit.
- Assignment and task progress generate transactional outbox events.

## Boundaries and next steps
- This implementation covers market picking and delivery tasks only. Cleaning and laundry task types are schema placeholders, not complete workflows.
- A completed task does not automatically mark an order delivered; fulfillment requires its own verified workflow.
- No staff payroll accruals, GPS tracking, guest notifications, or SLA escalation are implemented.
- Test-only signed context tokens must be replaced with production identity and scoped permissions.
- Ensure concurrency, reassignment and SLA deadline tests before any public deployment.
- Screens in Canva remain visual references; UI parity is not verified.

## Quality gates
CI should apply migration 0014 and test cross-property dispatcher isolation, unauthorized assignment, staff ownership, state transitions, cancellation propagation and tenant RLS.
