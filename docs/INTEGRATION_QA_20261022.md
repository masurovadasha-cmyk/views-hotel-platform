# Integration QA — 2026-10-22

## Owned slice

`scripts/integration-journey.browser.cjs` is a cross-feature proof, complementary
to the existing calendar, demo-market and broad Canva proofs. It makes no API
fixtures or writes: a loopback server supplies only built static files; any
external request, API request or non-GET request fails the proof. No live DB,
credentials, email, payment, inventory or booking is used.

For each RU/UZ/EN session it exercises:

- Save a two-night range spanning November/December, then abandon a replacement
  draft with browser Back and Forward; committed dates remain unchanged.
- Begin demo market review, invoke Review twice before rerender, and retain the
  same pending confirmation through guest tab navigation and staff workspace
  entry.
- Exercise Front Desk, General Manager and Super Admin calendars using different
  staff dates; returning to Guest retains the guest range without inheriting
  staff dates or losing the apartment photo source.
- Confirm twice without duplicating the order; verify availability 10 -> 9,
  retain order/calendar across reload, cancel once and verify availability 10.
- Save calendar reset and reload; dates remain reset while cancelled order
  history remains. Check both themes and mobile/desktop widths.

The script selects `VIEWS_BROWSER_EXECUTABLE`, then `/usr/bin/chromium` when
present, otherwise Playwright's managed executable. `VIEWS_JOURNEY_DIST` may
point to an independently built candidate (default `dist`). Its JSON output
records embedded release SHA, dirty-source status, version and exact checks.

## Executed development evidence

Worktree base: `9806762077d367baf642cab321fbe9d283fce48c`.

- `npm run build`: exit 0 in the isolated QA worktree.
- Baseline `node scripts/integration-journey.browser.cjs`: exit 1 at repeated
  Review: a spurious storage error appeared. This is a real pre-fix regression,
  not a green baseline.
- `VIEWS_JOURNEY_DIST=/workspace/views-integration-frontend/dist node
  scripts/integration-journey.browser.cjs`: exit 0 against the frontend agent's
  dirty candidate derived from 9806762. All three language journeys passed;
  zero page errors or unexpected requests. The candidate includes per-tab
  saved guest-date persistence and idempotent Review. This evidence is not a
  claim about a final clean integration SHA: root must rebuild and rerun after
  merging the agents' commits.

## Android / release review

The existing wrapper uses a Chrome74-targeted shared web build. Packaging
verifies compiled package/version/permissions and copied assets; signing reuses
an existing Expo template debug key and checks clean source/evidence/hash.
Independent review identified a provenance gap: packaging did not compare
`dist-android/release.json` against current HEAD before assigning current SHA
into build evidence. Reported to root (build script owner) for a bounded stale
bundle rejection gate; no packaging scripts were modified in this QA slice.

The previous API29/WebView74 emulator evidence demonstrates slow software boot
and stale UIAutomator heading text despite updated visual status. Android
acceptance should compare visible screenshot with quantity state and allow a
separate Android boot budget. Browser success is not APK installation proof.
Root owns final package/signature, native smoke, CI, preview and Library IDs.
