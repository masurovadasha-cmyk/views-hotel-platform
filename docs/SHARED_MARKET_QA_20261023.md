# Shared guest/staff demo market — independent QA

Baseline `607dc4862f43e6609746bfe70a83c94b69fcbea9` (PR #89).
Owned changes: this report and `scripts/shared-market.browser.cjs` only.

The browser proof creates a guest reservation, confirms it in the staff queue,
and verifies the guest sees its terminal state and updated available stock.
Saved calendar dates survive role changes. Confirmation Back, role revocation,
quota-write failure followed by retry, repeated confirmation and stale visible
confirmation are tested separately. An opposite terminal action must never
resurrect or release an already consumed order.

Literal legacy v1 fixtures exercise old reserved orders, reciprocal replacement
chains, an editing draft, pending replacement and ordinary pending checkout.
Staff actions remain blocked while the guest has an edit or pending transaction.
Owner sees an actionable reservation but has no mutation controls; cleaner and
technician have no queue navigation. Manager, administrator, front desk and
concierge can operate the demo queue. These are preview roles, not authenticated
permissions.

All scenarios run in EN/RU/UZ. Responsive checks use 360/768/1440 pixels and both
themes. The browser blocks every external/API request and every non-GET method.
Manipulating the review bundle's mode query must not activate Core or alter its
demo state. This review-bundle isolation check is not a Core tenant-isolation test;
the independent Core slice owns database-backed authorization verification.

```sh
node scripts/shared-market.browser.cjs
```

For independent candidate verification set `VIEWS_JOURNEY_DIST` to the built
candidate and `VIEWS_JOURNEY_SOURCE` to its matching translation source tree.
`VIEWS_BROWSER_EXECUTABLE` overrides Chromium; otherwise installed Chromium or
Playwright's bundled browser is used. JSON output includes release source SHA,
dirty state, locale scenarios, page errors and disallowed requests.

Executed candidate command:

```sh
VIEWS_JOURNEY_DIST=/workspace/views-shared-ui/dist \
VIEWS_JOURNEY_SOURCE=/workspace/views-shared-ui \
node scripts/shared-market.browser.cjs
```

Exit 0. All EN/RU/UZ journeys passed; `errors: []`, `requests: []`.
Candidate release metadata: `607dc4862f43e6609746bfe70a83c94b69fcbea9`,
`sourceDirty: true`. The implementation owner subsequently committed the same
application source as `98e7f5ea5bfd92cb1540bac038ac0187fa9b2afc` (report only
changed after its build). This is candidate evidence, not final clean-SHA CI or
Android verification. Syntax and whitespace checks also pass. No covered browser
contract blocker found; rerun after the final integrated clean build.

 No production/data/credential changes. Per-tab
session data is not a durable cross-device order service, and simulated completion
is not real delivery or payment. Root owns final clean build, CI, preview and APK.
