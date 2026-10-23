# Demo market replacement regression — 2026-10-23

Baseline: `24137758f9e94247375d906d4f6746c80b5e14ee`. This proof owns only
`demo-market-replacement.browser.cjs`; implementation and Core parity validation
are independently owned. No production, database, credentials or payment changes.

## Browser contract

The test starts with literal legacy v1 session records, without new replacement
fields. It verifies an existing reservation can be edited without releasing its
stock before confirmation, and that its own held units can fund the replacement.
An overlarge replacement fails without changing history. Draft reload, clearing
the draft, cancelling editing, Back to basket, repeated review and pending reload
preserve the original reservation. Quota failure cannot publish success; retry
and repeated confirmation create exactly one successor with reciprocal links.
Cancellation releases only the successor. Unrelated baskets cannot be overwritten;
a stale visible Confirm cannot mutate a later persisted basket. Old ordinary
pending checkout still confirms after the additive upgrade.

The journey repeats in RU, UZ and EN with 360, 768 and 1440 pixel layouts and
both themes. Every external request, API request or non-GET request fails the
proof. Demo disclosure, UZS and no-charge wording remain visible.

Run against a clean build in the integrated checkout:

```sh
node scripts/demo-market-replacement.browser.cjs
```

For independent pre-integration review, `VIEWS_JOURNEY_DIST` selects a candidate
built directory and `VIEWS_REPLACEMENT_SOURCE` its matching source directory for
translated labels. Chromium selection accepts `VIEWS_BROWSER_EXECUTABLE`, then
installed `/usr/bin/chromium`, then Playwright's default bundled browser.
Output includes the built release's source SHA and dirty flag. Candidate proof
must not be represented as final clean-SHA CI or Android installation evidence.

## Scope limits

Session storage is per tab. This tests old serialized state interpreted by the
new UI, not durable server data or restoration after Android process death.
Product quantities are synthetic; these records never become Core orders. Money,
warehouse movements, fulfilment and payments remain simulated. Unit tests own
malformed link graphs, history bounds and individual state transition rejection.
The parent integration run owns full calendar/roles regression, build provenance,
CI, web deployment, APK signing and Android execution.

## Executed evidence

`node --check scripts/demo-market-replacement.browser.cjs`: exit 0.

Candidate command:

```sh
VIEWS_JOURNEY_DIST=/workspace/views-next-ui/dist \
VIEWS_REPLACEMENT_SOURCE=/workspace/views-next-ui \
node scripts/demo-market-replacement.browser.cjs
```

Exit 0; all three locale journeys passed, `errors: []`, `requests: []`.
Candidate metadata reports baseline `24137758f9e94247375d906d4f6746c80b5e14ee`
with `sourceDirty: true`. The implementation owner subsequently committed the
same application source as `64a84cc216d0e4005239f4ccacefc6b4377774cd` (additional
unit-test/report changes followed its build). This is independent candidate
verification, not a clean integrated release claim. Parent must rebuild and rerun
at the final combined SHA. No blocker found in the covered browser contract.
