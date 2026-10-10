# VIEWS Canva v0.4 integration inventory and release gate — 2026-10-11

## Sources reviewed in Canva
- Guest Light RU: DAHXl9y159I, 55 pages, 8 service families, orders, payment method selection, progress tracking, partner handoff.
- Dispatcher Light/Dark RU: DAHXl90SHbY, 60 pages, service queues, assignments, SLA, proofs, partner integration, finance.
- Administrator Light/Dark RU: DAHXl0tiYAY, 30 pages, multilingual service catalog, price rules, availability calendar, resources, SLA, event journal.
- Design System: DAHW8X09Gpg, 6 pages, UZ/RU/EN, UZS, shared calendar, themes, components, loading/empty/error/offline/read-only states.
- Earlier Guest App DAHW8ckAcO4, Staff CRM DAHW8X4U68A and 60-page presentation DAHXhHquzgw are reference sources, not production implementation.

## Implementation audit
| Canva capability | Current application | Status |
| --- | --- | --- |
| Light/dark visual tokens | shared styles.css | Theme tokens aligned in this commit |
| Guest property discovery and booking | GuestApp | Existing, not visually signed off |
| Guest services and market | GuestApp / MarketDemo | Demo + partial server services; incomplete |
| Dispatcher order queue | StaffApp / MarketDemo | Demo plus read-only BFF |
| Assignment and terminal status | Core internal routes | Code present; restricted runtime DB write authorization incomplete |
| Admin multilingual catalog and pricing | Core catalog schema | UI incomplete |
| Shared range calendar across all roles | Existing date controls | Not implemented globally |
| Payment/room-charge/partner handoff | Mixed demo/integrations | Not production-verified |
| Staff SLA/proofs and event journal | Mixed components | Not end-to-end verified |
| Android install and signing | Review APK | CI APK only; device and release signing not verified |

## Production acceptance gates
1. Implement and visually verify the Canva screens in guest, dispatcher, admin, host and staff roles, including responsive light/dark and UZ/RU/EN.
2. Replace demo data with authorized, tenant-scoped APIs; keep a conspicuous DEMO label for localStorage workflows.
3. Pass database write-role authorization, concurrent stock reservation, idempotency, cross-tenant denial and payment ledger tests.
4. Pass mobile accessibility and calendar tests for booking and CRM in all roles.
5. Verify partner/PSP contracts, legal terms, refunds, passport handling and consent before live use.
6. Stage and smoke-test with synthetic data; verify rollback, logs, backup/restore and monitoring.
7. Sign APK with a persistent controlled release key, validate manifest/permissions, install on real Android devices, then publish through approved distribution.
8. Merge and deploy only after all gates pass. The Stage 7 artifact is a **review build**, not a production release.

No claim is made that all Canva pages have been implemented; this is the source-of-truth integration inventory for tracking that work.
