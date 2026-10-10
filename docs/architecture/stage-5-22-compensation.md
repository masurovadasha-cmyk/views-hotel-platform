# Stage 5.22 — Task compensation accrual (development only)

- Compensation is a UZS amount snapshot attached to a completed dispatch task.
- One accrual per task; repeated requests with the same amount return the same record.
- Changes to the amount or employee after accrual are rejected rather than silently overwritten.
- Only an actor with property-level `order:manage` permission may accrue or approve.
- The task assignee cannot accrue or approve their own compensation.
- The approver must be different from the accrual initiator (four-eyes control).
- `POST /api/v1/compensation/accruals` and `POST /api/v1/compensation/accruals/:id/approve` require admin or finance role.
- No wages are paid by these routes. Approval is an internal record only.
- This does not calculate statutory wages, withholding, social taxes, overtime, bonuses or employment benefits.

Release blockers: approved rate cards, signed employee contracts, payroll integration, accountant review, audit of adjustments, HR permissions and payment provider settlement. Production OIDC is also not yet implemented.
