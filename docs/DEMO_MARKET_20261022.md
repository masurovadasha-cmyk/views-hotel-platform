# Local demo market orders — 2026-10-22

Continuation of calendar PR #85 (`0628bf6`), which already includes Stage 7
`043f164`. Fresh remote inspection found no newer market implementation branch.
Core market workflows already exist under `features/market-core` and PostgreSQL;
this change only fills the public static demo's shopping-list gap.

The existing eight sample products each start with **10 synthetic units**. No
real prices are invented: UZS is disclosed, the amount remains unpriced and no
charge is recorded. Catalogue icons remain illustrations; no unrelated product
photos are substituted. Apartment photos and the shared calendar are unchanged.

One per-tab sessionStorage record contains cart, pending confirmation token and
order history. Review freezes the basket. Confirm checks every line before one
atomic storage write. A repeated/stale confirmation token cannot create a second
order or confirm a later basket. Reload recovers a pending review or committed
order. Storage failure publishes no success and retains the pending token for
retry; invalid storage fails closed without resetting history.

Quantity balances are derived from order lines and terminal states, avoiding a
second mutable stock ledger: available = 10 - reserved - consumed. Cancel releases
reserved quantities, fulfilment converts reserved to consumed. Terminal orders
cannot transition again. All actions are explicitly local simulations. There are
no API calls, credentials, payment/card fields or live warehouse mutations.

Limits: 100 orders per tab session, 20 units per basket line, per-tab isolation
(including a copied/new tab's independent session), no cross-device sync, no real
reservation/authorization/delivery/payment. Browser session restoration may retain
sessionStorage. This is not a substitute for the authoritative Core workflow.

Verification: `npm run typecheck`; `npx vitest run`; pinned pnpm 10.18.3
`workspace:check`; `node scripts/demo-market.browser.cjs`; existing Canva and
calendar browser proofs. The demo proof covers RU/UZ/EN, three widths, both themes,
review cancellation, interrupted reload, double confirmation, history reload,
cancel/fulfilment accounting, stock rejection, storage failure/retry, corrupt
storage and absence of network mutations. Exact executed results belong to the
PR evidence, not this command list.

Android uses the existing Expo template debug identity. No new key or release
identity is generated. Physical-device and old-signature upgrade compatibility
require separate verification.
