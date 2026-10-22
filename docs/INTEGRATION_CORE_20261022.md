# Core compatibility review — integration milestone, 2026-10-22

Read-only inventory from the refreshed canonical remote snapshot. Review base:
`9806762077d367baf642cab321fbe9d283fce48c`; operational Core ancestor:
`043f164f243ef97f99d0b038d2e7b0918caedc84`. No live database, migration,
credentials, external email, payment or tunnel was changed. No backend code bug
requiring an operational behavior change was found in this bounded review.

## Selection ledger

An open PR is not necessarily missing code. Ancestry establishes inclusion for
#54/#85/#87 and merged #84/#86; the other branches below were inspected separately.

| PR | Frozen head SHA | Decision and reason |
| --- | --- | --- |
| #42 | `fc4e1407094b57776e90254024fa46e95665fa6c` | Deferred: independent Quick Tunnel scrape/HA-observer behavior; not an ancestor and outside this review milestone. |
| #54 | `043f164f243ef97f99d0b038d2e7b0918caedc84` | Included by ancestry: authoritative Core, service workflows and canonical migration root. |
| #55 | `466029da51c0535c185d1ec14e78cabbbd8a4bd1` | Deferred: Windows rollout/passkey operators; old 44-migration snapshot matches the first 44 canonical migrations, but machine rollout is outside this cloud web/APK milestone. |
| #58 | `3681e469e21ec7388da640f889b59cef901190f6` | Deferred: alternative market demo/inventory implementation; do not introduce a second demo owner. |
| #59 | `57e9fef2a4d647e35b6c946f61215edcd9ff937e` | Rejected for whole-branch integration: competing service architecture and conflicting migration numbering. |
| #60 | `d92ea44ce76cca35a47b81fef9b7f245db9d8eab` | Deferred with the alternative market demo/task model. |
| #61 | `c106e68945f0ecfce5f27609bef8b86aaa3dd1ed` | Deferred: competing server market schema; conflicts at PostgreSQL migration IDs 0035–0040. |
| #62 | `5216affd0e6bf26745efc008a2a4058d6655693f` | Deferred with the alternative market server/gateway chain; security ideas must be ported against current contracts, not copied wholesale. |
| #63 | `2658714df04082221663e8f8445c2736dabaf02b` | Deferred with the alternative market server/gateway chain; security ideas must be ported against current contracts, not copied wholesale. |
| #64 | `b1facf0cda6df07f9961e7152a59f4a4ed91eb80` | Deferred with the alternative market server/gateway chain; security ideas must be ported against current contracts, not copied wholesale. |
| #65 | `f29ab3c4842d67763203581f5fda443c7331d1c7` | Deferred with the alternative market server/gateway chain; security ideas must be ported against current contracts, not copied wholesale. |
| #66 | `5af40732ca04d1ba8e3de6412f42aa35e64a219a` | Deferred with the alternative market server/gateway chain; security ideas must be ported against current contracts, not copied wholesale. |
| #67 | `84298e646621d1069479ba3992b8e474362e6c01` | Deferred with the alternative market server/gateway chain; security ideas must be ported against current contracts, not copied wholesale. |
| #68 | `6f6b6dd4a81bcee12aa3d49dfc644779214b7210` | Deferred with the alternative market server/gateway chain; security ideas must be ported against current contracts, not copied wholesale. |
| #69 | `cb3b8f6f98968397bb814dc3cc550ffa9dbe6de1` | Deferred with the alternative market server/gateway chain; security ideas must be ported against current contracts, not copied wholesale. |
| #70 | `5bfc965a9709e2e9c1ff7cbe4b7cd1d5d71d392a` | Deferred with the alternative market server/gateway chain; security ideas must be ported against current contracts, not copied wholesale. |
| #71 | `de525de1d1d4b66e083ee4ee38aa26e0072b25fd` | Deferred with the alternative market server/gateway chain; security ideas must be ported against current contracts, not copied wholesale. |
| #72 | `0752a9c36ed29a4c0c6bc418d62ecc8334835e70` | Deferred with the alternative market server/gateway chain; security ideas must be ported against current contracts, not copied wholesale. |
| #73 | `773cf23afd2413bb63f4070d1ec2d374a5b91c14` | Deferred with the alternative market server/gateway chain; security ideas must be ported against current contracts, not copied wholesale. |
| #74 | `a7135773e00824ac2666bd578a53ffa4f6afae2c` | Deferred with the alternative market server/gateway chain; security ideas must be ported against current contracts, not copied wholesale. |
| #75 | `bb457d3e3a6cc2c33b73db85bb1f4d66c2413b7a` | Deferred with the alternative market server/gateway chain; security ideas must be ported against current contracts, not copied wholesale. |
| #76 | `48a6f0bf6a25a0139be54fa8267bdf169bfe9294` | Deferred with the alternative market server/gateway chain; security ideas must be ported against current contracts, not copied wholesale. |
| #77 | `9a34fd5b3c270d8871be15b6f52062a0b4de79c2` | Deferred with the alternative market server/gateway chain; security ideas must be ported against current contracts, not copied wholesale. |
| #84 | `69e2e4424f7d6a047540f8f95dde192274c71174` | Already merged into #54 and included by ancestry; do not reapply. |
| #85 | `0628bf661c90d6b3a5ea05fac74c06fcffb2982f` | Included by ancestry: shared stay calendar. |
| #86 | `1d212da3ac713bc38649a8224e4f4e425821bdf4` | Already merged into #54 and included by ancestry; do not reapply. |
| #87 | `9806762077d367baf642cab321fbe9d283fce48c` | Integration starting point: local demo orders and patched Next dependency. |

## Concrete schema conflicts

The authoritative root is `db/migrations` with 130 unique numeric IDs, 0001–0130,
and `db/migrations.sha256`. Its complete SHA-256 manifest fingerprint at #54 and
#87 is `f498c811e9a0f3acc3483bd5ffeb430d85e603dd49c8d6a343c703ceb52531c5`.
`apps/api/db/migrations` is an obsolete location, absent in the integration base.
The separate top-level `migrations/` belongs to legacy D1 and must not be combined
with PostgreSQL migrations merely because numeric filenames overlap.

PR #61's old PostgreSQL tree has six conflicting migration IDs:

| ID | Canonical meaning | Competing #61 meaning |
| --- | --- | --- |
| 0035 | provider egress audit | market service order foundation |
| 0036 | Payme Merchant API | market order scope hardening |
| 0037 | Payme transaction invariants | market stock foundation |
| 0038 | Payme expiry scan index | market catalogue prices |
| 0039 | staff password sessions | market command idempotency |
| 0040 | staff email delivery | market staff write policies |

The #77 chain retains the competing 0035–0038 files. Its tree is not an extension
of current canonical history. PR #59 has 22 SQL files across IDs 0001–0020, all
conflicting with canonical meanings; it also internally repeats 0008
(`guest_booking_access`, `guest_stays`) and 0009 (`guest_bookings`,
`payment_ledger`). Blind renaming is insufficient: tables, references and API
models differ. Any future port needs new canonical forward-only migrations and
contract review, without rewriting previously applied checksums.

The schema guard in `scripts/integration-schema.acceptance.cjs` validates all
current checksums via the existing loader, rejects repeated numeric IDs, pins the
first 130 migration names/checksums, and prevents obsolete Core roots being
silently reintroduced. New migrations can append after 0130. Fixture checks cover
both actual conflict patterns (0008 and 0035). It does not connect to a database.

## API and ownership compatibility

Current guest market routes are in `service-order.controller.ts` under
`v1/guest-identity/email/services/market`; staff routes are under the current
service-order workspace controller, with property scope and an authenticated staff
session. `market.input.ts` accepts reservationId, expectedTotalMinor as a decimal
minor-unit string, and lines of serviceId / integer quantity / expectedRevision.
It rejects invented scope fields, duplicate products and numeric money. Real
orders use `service_orders`, `market_order_lines` and `supply_*` accounting through
canonical SQL. Guest stock/cart functions begin at migration 0081, with later
receipt/replay/authorization fixes and temporal pagination through 0130.

The old #61–77 chain instead introduces `market_service_orders`, an internal
`v1/internal/market/properties/:propertyId/orders` reader and a D1 identity adapter.
Those are different endpoint, storage and identity contracts. They cannot be
wired to current `features/market-core` just by copying a response adapter.
Current operational tests already cover replay authorization, scoped staff access,
quantity/revision input validation and guest receipt/issue flows. Deferred old
security patches are not being declared unnecessary or merged: their intended
invariants are checked against the current implementation, and any uncovered
semantic gap should be a separate forward-compatible port.

The public demo's `views.demo-market.v1` sessionStorage record is deliberately not
an API payload: IDs such as DEMO-1 and sample-water are not Core UUIDs, quantities
are synthetic, prices are unconfigured, and no Core reservation or ledger is
created. The integration must preserve that boundary rather than cast demo data
into the connected service contract.

PR #42 is specifically not marked included: three unique commits change the
Quick Tunnel scrape versus HA-observer behavior; the net change touches four
observability files. It is deferred as infrastructure work outside the current
calendar/market release. PR #55 similarly remains a separate Windows rollout
exercise, not evidence of a rollout on this cloud host.

## Executed checks

On base 9806762 with only this new guard/report in the working tree:

- `node --test scripts/integration-schema.acceptance.cjs scripts/migration-manifest.acceptance.cjs`: 4 passed, exit 0.
- `npm --prefix apps/api run typecheck`: exit 0.
- From apps/api, `./node_modules/.bin/vitest run src/service-orders/market.input.test.ts src/booking/booking.validation.test.ts src/inventory/stay-period.test.ts`: 16 passed in 3 files, exit 0.

Full disposable SQL/Core and combined frontend checks remain the integration
owner's final-SHA gate; this report does not transplant earlier test results onto
a later commit or claim a live database upgrade.
