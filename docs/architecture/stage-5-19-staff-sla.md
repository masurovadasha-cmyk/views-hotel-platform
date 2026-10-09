# Stage 5.19 — Staff mobile view and SLA (development)

## Implemented
- `/staff` serves a responsive task list, external CSS compatible with the existing CSP, and a client that uses the same authenticated VIEWS API.
- Staff see only their own assigned tasks and can move them from assigned → in_progress → completed.
- `/api/v1/dispatch/sla` reports tenant-scoped counts of all tasks, open tasks, completed tasks, and overdue tasks, scoped to properties managed by the dispatcher. Admin role may view organization-wide counts.
- CRM shows live SLA totals from PostgreSQL.
- Reassignment cannot reset an in-progress task to assigned.
- HTTP integration tests verify assets, role enforcement, property isolation and transition guards.

## Boundaries
- Manual token entry is a development-only aid. No production login/session UI yet.
- This is not a full cleaning/laundry workflow. The schema enumerates service kinds but their operational checklists, photographs, inventory of linens, approvals, prices and payroll require separate domain implementation.
- SLA counts are based on task deadlines. They are not yet contractual SLA calculations with calendars, holidays, escalation, compensation, or per-service targets.
- No push notifications, background sync, offline mode, photo uploads or real employee payroll.
- Do not expose the development API or token input on the public internet.
