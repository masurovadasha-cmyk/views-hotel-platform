# VIEWS — delivery sequence after the 0.7.17 review build

This document separates source implementation, automated proof, review release,
and production activation. It is not a claim that all stages are complete.

## Preserved baseline

- One repository: `masurovadasha-cmyk/views-hotel-platform`.
- No Vertex Vision/Taxi/Engineers/JARVIS code or deployment is mixed in.
- No paid infrastructure or paid upgrade is provisioned.
- Review source: `02a6322d66d257bf7220b36fde6b2715405e7884`, APK 717004.
- Review mode remains static-demo. No real PII or payment data is to be entered.
- Runtime library work starts from Stage 7.17 `5ec8f6b85b7574bfcb3698cbd0a03470f5b1f74d`.
- Main and the published review branch are not updated by the client stage.

## Current work

Stage 7.18 supplies provider-bound request policies, real relay/TLS transport,
non-retrying delivery semantics, a required audit contract, cancellation, limits,
and destination-policy hardening. Local tests are not substituted for CI or
live provider evidence. The default provider registry remains empty.

## Ordered gates to a useful connected application

| Gate | Required artifact and proof | Activation constraint |
| --- | --- | --- |
| 1. Durable provider audit | Tenant-scoped attempt/outcome storage, outbox, recovery of uncertain delivery; migration and RLS tests | No no-op audit sink; do not log documents or secrets |
| 2. First provider sandbox adapter | Verified provider API contract, signed sandbox webhook, idempotency/replay tests, ledger reconciliation and refund states | Real provider onboarding and test credentials are not present in this change |
| 3. Persistent staging Core | Restricted DB role, migrations, backups/restore rehearsal, named tunnel, stable hostname and both-replica failover evidence | Must fit the user's zero-cost limit; no assumed free VM or hidden paid plan |
| 4. Guest/staff live journey | Login, quote, hold, booking, sandbox payment, check-in/out, cleaning and reconciliation against one staged backend | The existing review APK must not be silently repointed to production |
| 5. Tenant and owner onboarding | Import verified inventory, owner permissions, tenant isolation, role/PII checks, empty/loading/error states | No fabricated real bookings, balances or occupancy |
| 6. RU/UZ/EN and mobile readiness | Shared localization, money/date/timezone formatting, accessibility and navigation tests | Web and Android continue to share one frontend |
| 7. Stable Android release | Persistent signing key in an approved secret store, update-path test, emulator install/launch and physical-device evidence | Current APK uses an ephemeral review key; do not claim in-place update compatibility |
| 8. Operational acceptance | Repeatable rollback, incident/audit records, backup restore, external health probes, load/concurrency tests | Cloudflare deployment error and unmerged stacked PRs are not declared solved by UI tests |
| 9. Production decision | Reviewed legal/tax/fiscal/registration requirements, provider approvals, all preceding acceptance evidence | Explicit publication approval and zero-cost constraint remain in force |

## Not closed by this change

A permanent named tunnel and host-level HA have not been activated. The
Cloudflare Workers build error observed on the Stage 7.17 commit remains a
separate deployment issue. Earlier successful GitHub jobs do not make that
Cloudflare check green. Physical Android execution and real payment processing
are also not proven by this change.
