# Stage 7.44 — front-desk turnover queue

The existing Core reception projection now has a dedicated room-readiness panel
with a navigation link, reservation/unit search, planned-checkout or numeric unit
sorting, server totals and an explicit partial-result warning. Search/sort operate
only on loaded rows; they do not imply complete server-side pagination. The queue
shows current pending turnovers independently of the selected reception date.
Checkout timestamps are labeled as planned, not actual cleaning/checkout times.

Check-in, checkout and cleaning confirmation use a keyboard-accessible modal:
initial focus, Tab/Shift+Tab containment, Escape cancellation, busy state and
focus restoration to the triggering button or reception heading. Cancellation
does not submit a command. Existing Core permissions, CSRF, idempotency and
transactional turnover/audit/outbox behavior are unchanged.

This is a front-desk synthetic pilot, not a cleaner login or assignment system.
Nonpilot rows cannot be confirmed. No permissions or migrations were added;
the persistent database and existing staff accounts were preserved.

## Verification

Tested dirty continuation of b5d0402afd68c07e88a7618a3206774f674e7bda:

- Web typecheck/build and Core build: exit 0.
- Root unit tests: 222 / 36 files, exit 0.
- Core staff-auth unit tests: 20 / 3 files, exit 0.
- Core network gate: 119 scanned files, no findings, exit 0.
- Mail acceptance: 15 tests, exit 0.
- Staff HTTP proof: 13 groups / 32 calls, exit 0.
- Stay browser proof: 16 groups, exit 0, no page errors. Real local Core covers
  guest/document/check-in/out/turnover persistence. A separately labeled UI-only
  intercepted projection covers truncation, numeric unit order, timestamp offsets
  and disabled nonpilot actions; those rows are never written to Core.
- Booking browser: login, reserve/reload/release, restart, navigation including
  cleaning, logout and 360/390/768/1440 widths; exit 0, no page errors.

The first browser runs exposed a select accessible-name mismatch and lost focus
after cancellation; both were fixed and the full browser sequence passed.
An initial Core unit invocation used the root runner, found zero files and exited
1; rerunning from apps/api executed all 20 intended tests successfully.
Final clean-source browser reports record their own sourceCommit/dirty fields in
the private local evidence directory. No new public deployment or APK release.

## Remaining work

Cleaner roles/assignment and owner onboarding against Core, full RU/UZ/EN,
real document/provider adapters and production/device acceptance remain open.
See CURRENT_DELIVERY_STATUS.md for the broader delivery gates. Public hosting,
domain and permanent Android signing identity are still unavailable per owner.
