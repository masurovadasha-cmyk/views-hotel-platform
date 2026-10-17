# V Market — 0.11.0-preview

Owner request: add V Market everywhere using minimal resources. Scope assumption:
V Market extends the existing guest mini-market service. This release provides
an explicitly illustrative catalogue and shopping list in the shared web/Android
client. It is not a functioning retail checkout or a completed marketplace.

## Delivered

- Eight sample products, four categories, localized search, quantity controls,
  removal, clear and review. RU/UZ/EN, existing light/dark tokens and responsive UI.
- Cart survives guest tab/service navigation in memory. Refresh, leaving the guest
  application or restarting clears it; no customer data is persisted or transmitted.
- Quantities are integers 0–20; zero removes a line. Unknown product IDs and invalid
  quantities are rejected. A change invalidates the previous review. No invented
  prices, totals, warehouse stock, delivery times or successful orders.
- Staff service label is V Market; existing `minimart` API category, authorization
  and service workflow remain compatible. Existing live free-text service requests
  remain separate from the unsent sample basket. No automatic transfer of sample SKUs.
- Procurement/warehouse workspace explains the separate demo catalogue. The real
  quantity ledger, partial receipts and stocktakes remain unchanged. Sales do not
  consume that ledger yet; this is explicitly shown, not described as integration.
- No new packages, images, external services, paid resources, migrations or seeds.
  Same React client and Android application ID/signing identity.

## Run and validate

`npm ci` then `npm run dev` for development; `npm run build:review` for static web.
Open guest demo → Services → V Market. `npm test`,
`node scripts/canva-design.browser.cjs` after a web build. Android:
`npm run build:android`, existing `scripts/build-android-review.py` and separate
approved signing helper; see previous release instructions for installed SDK/key
locations, never put private key values in Git.

Local dirty-source checks relative to 9de7df2: frontend typecheck/build pass;
Canva browser 232 layout checks,126 contrast samples, minimum5.15:1; V Market
categories/search/count/remove/review invalidation/tab retention in3languages and
2themes; no browser JS errors/API/external calls. Root310tests/57files, network boundary172files and mail15assertions pass. Signed
APK/public verification are recorded in the release notes after actual execution.
Core typecheck/build and24 staff-auth unit assertions pass. The unfiltered
`vitest run src/staff-auth` also selected a PostgreSQL integration file and failed
without DATABASE_URL; it was not run against persistent data. Hosted disposable
Core verification supplies its database. Backend code/schema are unchanged.

## Review and remaining work

Manually check mobile touch/keyboard, pronunciation of Uzbek labels and physical
APK upgrade from0.10.1. APK compilation/signature/bundled-browser evidence is not
physical phone installation. Published source SHA/checksum belong to release.json
and GitHub release notes. Do not replace older release assets.

Before real retail operations: approve actual products and prices; map property-
scoped sellable SKUs to stock; implement transactional reservations/order states,
expiry/cancellation, idempotent fulfilment/returns, taxes/folio/payment and employee
permissions with concurrency tests. No confirmed delivery/price should derive from
these sample IDs. Public Core/email/payment and full B3–B11 work remain open.

Review URLs (verify after publication):
- https://staging-master-reference-v1-views-hotel-platform.masurovadasha.workers.dev/
- https://masurovadasha-cmyk.github.io/views-hotel-platform/
- https://github.com/masurovadasha-cmyk/views-hotel-platform/releases/tag/v0.11.0-preview
