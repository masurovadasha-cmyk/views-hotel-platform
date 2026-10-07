# VIEWS release gates

Historical Pages/D1 preview checklist. Current PostgreSQL Core delivery and
remaining gates are tracked in [CURRENT_DELIVERY_STATUS.md](CURRENT_DELIVERY_STATUS.md).
D1 is not the operational source of truth; passing this historical checklist
does not authorize production activation.

A VIEWS release candidate is acceptable only when all of the following are green:

1. Production dependency audit
2. TypeScript frontend + Cloudflare Functions
3. Domain tests
4. Canva screen parity tests
5. Production build
6. Full D1 migration chain
7. Published GitHub Pages smoke test
8. Cloudflare live E2E once live staging is enabled
9. Finance read projection: PostgreSQL source-of-truth marker, live money disabled, zero unbalanced posted journals

## Canva master parity
- Guest: 20 screens
- Host: 5 screens
- Staff Web: 7 screen groups
- Staff Mobile: 5 screens
- Admin: 4 screen groups

## Live E2E gate
Required before production:
1. email login
2. secure session cookie
3. authenticated guest booking read
4. guest service request
5. persisted D1 Service Order
6. role-filtered Staff Inbox / My Tasks
7. accept -> start -> complete
8. housekeeping inspection -> ready
9. audit/outbox evidence
10. logout/session revocation

No production merge should be treated as a release solely because static UI renders.


## Finance projection gate
The Pages/D1 finance surface is read-only. It must never become the payment source of truth, must never collect card data, and must fail acceptance if any projected posted journal is unbalanced.
