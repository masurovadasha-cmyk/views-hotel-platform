# Canva adaptation across existing modes — 0.12.0-preview

Scope: adapt the shared application to the 32 accessible Canva export pages
(Guest 9, Staff CRM 17, Design System 6), including existing authenticated Core
surfaces. This is a visual integration increment, not completion of every
functional promise in the slides. See CANVA_SCREEN_PARITY.md for open features.
The 60-page pack and 50-page Vertex document remain unavailable (download limit);
Vertex is not merged into VIEWS. No new dependencies, services or paid resources.

## Implementation

`src/design-system/core-surfaces.css` extends the existing tokens: cool staff
panels, typography, controls, focus, role headings, account navigation, folio,
procurement and warehouse forms; warm guest sign-in, trips and cancellation.
The root `data-runtime` attribute identifies the selected mode for regression
checks. The runtime selection, authorization, mutations and database are unchanged.
The shared frontend is used by web and Android; public builds remain static demo.

| Mode | Acceptance coverage | Boundary |
| --- | --- | --- |
| static-demo | Portal, guest, staff, host/admin entry, V Market; 3 languages, 2 themes | Illustrative data, no real purchase |
| live-api | Legacy CRM 16 sections and guest bookings; 3 languages, 2 themes, 4 widths | HTTP fixtures, not proof of a deployed backend |
| local-core | Sign-in, 9 roles, supply forms, folio entry, reception, housekeeping, owner, errors and role mismatch | Read-only fixture responses for visual checks; real permissions unchanged |
| guest-core | Sign-in, owned trip, cancellation quote, session error and offline state | No cancellation confirmation sent; public email/Core disabled |

No schema change or migration is required. Existing server contracts and isolation
remain authoritative. Missing technician/concierge operations remain explicitly
unavailable; styling does not grant access. V Market sample carts remain separate
from actual stock and cannot submit retail orders.

## Run and evidence

Use existing dependencies (`npm ci` if needed), then `npm run build`.
Development: `npm run dev`; local Core uses the existing approved loopback setup.
No reset, seed or persistent database operation is needed for these checks.

Checks on the changed tree relative to bdd6d15:

- TypeScript and web build pass; root tests: 310 / 57 files.
- `node scripts/canva-design.browser.cjs`: 232 layouts, 126 text contrast samples,
  minimum 5.15:1; no external requests or JavaScript errors.
- `node scripts/canva-core-surfaces.browser.cjs`: 289 layouts, 2,101 text contrast
  samples, minimum 4.90:1; 37 fixture reads, no writes/external requests/JS errors.
  Tests include 360/768/1440 widths and RU/UZ/EN. Added to CI.
- `node scripts/guest-localization.browser.cjs` and
  `node scripts/legacy-staff-localization.browser.cjs`: pass; live fixture theme
  coverage extended without changing API enum/body assertions.
- Owner inventory/create/edit/calendar and housekeeping browser fixture suites pass.
- Core TypeScript/build pass; server implementation is unchanged.
- Network primitive boundary and 15 staff-mail acceptance assertions pass.

Core visual fixtures never connect to the persistent database. They complement,
not replace, real backend integration tests. Sample contrast checks do not certify
full WCAG conformance. Release publication/SHA/APK verification are recorded in
GitHub release notes after execution, not inferred from compilation.

## Manual review and risks

- Review role navigation, long Russian/Uzbek text, keyboard focus and input zoom
  on actual mobile devices; compare accessible PDFs with the adaptation.
- Check physical Android upgrade using the existing signing identity. Bundled
  browser/signature checks are not proof of installation on a phone.
- Exercise authorized Core flows on a separate test installation. Production
  Core, external email, payments, legal/provider onboarding remain separate work.
- Larger Canva files are needed to assess their additional pages; do not claim
  exact pixel parity without the source tokens/assets and visual acceptance.

Partial service-research work is preserved outside the release checkout at
`/workspace/views-services-research-draft-2026-10-10/services-v1`. It is incomplete
and was not published as a finished specification. Next functional work should
use the existing parity/backlog, not infer implemented features from UI controls.
