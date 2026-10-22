# Frontend integration review — 2026-10-22

Base: `9806762077d367baf642cab321fbe9d283fce48c` (PR87), containing calendar
PR85 `0628bf661c90d6b3a5ea05fac74c06fcffb2982f` and Stage7 PR54 `043f164`.
This worktree owns guest/calendar source only. Root instructions, README,
CODEX_START and CODEX_HANDOFF were reviewed; no `.agents/skills` directory exists
in this checkout. Historical handoff tasks are not new authorization for live
operations. No dependencies, backend, migrations, production or keys changed.

## Included fixes

1. Saved guest demo dates previously lived only in GuestApp component state:
   switching to Staff CRM or reopening the access screen unmounted the guest and
   erased its saved range, although the demo market survived the same navigation.
   Save now retains only the two date-only strings in `views.demo-stay.v1` for the
   tab session. Only complete valid future ranges in property timezone
   Asia/Tashkent restore; malformed, partial and elapsed preferences restore empty.
   Calendar drafts and Cancel never write. Reset followed by Save stores an empty
   range. Storage failure does not disable calendar use. `live` GuestApp never
   reads or writes this demo preference. No booking, occupancy or quote is stored.
2. Repeating Review on a valid pending demo order previously threw `pending`,
   shown as a misleading storage failure. Repeated Review is now idempotent,
   retaining the pending basket and token, including after reload. Quantity edits
   remain locked until confirmation or return to basket.

## Older slices reviewed, not blindly merged

| PR / head | Finding and disposition |
| --- | --- |
| 78 `013af167089bd78061d259ca17b7cb15ffa75513` | Guest-scoped scrolling StayDateRange predates the current shared `features/calendar` implementation. Keep current implementation; duplicate component not imported. |
| 79 `ecfbda0377606bde3262d15cb3c45cb69b93d2e2` | Extracted date selection/domain tests are already represented by the current shared model plus date-only/timezone regressions. No duplicate model. |
| 80 `1896bf7e4c5439e5d9329298a85b284486c27a57`, 81 `a960bc30a1de3dce5782e6b8880bf37fef0a7e2b`, 82 `02d1a0f4766a6dd5772b352c635bdeb34137f969`, 83 `31b0b27819daaabc404669459cf78abf58f762ed` | Older Front Desk, Host and Admin calendar placements. The current shared calendar already covers these modes and connected Core/owner paths; do not overwrite newer StaffApp with old placement changes. |
| 56 `76db097b94aa5e26ee7d35870a6fdebfd84031aa` | Merged into the older web/APK branch, not evidence of current ancestry. Its separate MarketDemo/state/payment-labelled model would duplicate the current explicit local-demo transaction model and connected Core market. Deferred. |
| 57 `ddc3dee686975f8965a28fd604f066c9f568b27f` | Apartment remote galleries and market photography were added on the older branch. Market `marketImageFor(category)` uses generic external grocery/pantry/bakery photographs while assigning per-SKU “product photo” alt text. That is not verified SKU photography, so it must not be imported as such. Existing bundled apartment images are retained. |
| 58 `3681e469e2` | Integrity changes target the older `domain/marketModel` and `features/market/MarketDemo`, not the current local demo or Core. Current whole-basket checks/idempotency are retained; no second mutable inventory model imported. |
| 60 `d92ea44ce7` | Adds staff tasks, assignment and SLA to that same older MarketDemo. Broader fulfilment/staff integration is outside this bounded candidate; do not represent demo order history as a connected staff queue. |
| 59 `57e9fef2a4` | Divergent WIP service-core branch does not even expose package.json at its root; requires a separate architectural review instead of overlaying files into this verified workspace. |

The four bundled apartment files (`modern`, `panoramic`, `garden`, `peach`) were
SHA-256 checked against `src/assets/demo/sources.json`: all match. The manifest
records the original VIEWS listing image URLs. This checks retained provenance,
not new license verification or authorization to republish unrelated images.
No photos were replaced or fetched.

## Verification

- `npm run typecheck`: exit 0.
- `npx vitest run src/features/guest/demo-stay.test.ts src/features/guest/demo-market.test.ts src/features/guest/guest-locale.test.ts`: exit 0, 37 tests in 3 files.
- `npm run build`: exit 0 (worktree candidate before commit).
- Independent cross-role/calendar/market browser verification is owned by the
  integration QA stream and run against the combined integration build; its
  result is not claimed by this source review.

The date preference and market session remain local to a tab and independent of
real guest authorization, booking inventory and payment systems.
