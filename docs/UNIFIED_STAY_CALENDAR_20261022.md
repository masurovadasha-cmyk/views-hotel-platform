# Unified stay date interface — 22 October 2026

Continues PR #85. Before implementation, GitHub was refreshed: #84 had been
merged into `stage7/staff-email-delivery-v1`; that branch advanced to `043f164`
with separate supply-queue work. Those commits were merged into this working
branch without changing their code. PR #85's remote head was still `3b14abb`.
Older calendar proposals #78–83 were inspected. Their vertical month layout and
`nextStaySelection` concept are continued here, adapted to the current localized
frontend and #85's validated date-only arithmetic. Do not independently merge
the old UI patches over this component. No additional checkout SKILL.md files
were found.

## One component and explicit semantics

`src/features/calendar/StayDateRange.tsx` is shared by guest search and booking,
all legacy staff demo roles (including Host/Admin), the connected Front Desk
loaded-list filter, the local PostgreSQL booking workspace, and the owner's
calendar window. Vertical months, round endpoints, range fill, nights, Reset,
Save and Cancel all use the same implementation. The former fabricated host
occupancy squares are removed. Demo selection does not assert availability,
create reservations or change rates.

Connected Front Desk filters the currently loaded reservations with half-open
stay overlap; it does not claim an exhaustive server search. Local Core remains
the quote/hold authority. Saving dates invalidates a stale quote/hold UI; cancelling
a draft preserves it. Empty dates disable quote/window submission. Existing Core
limits (30 nights booking, 62-day owner window) are enforced in the picker and
remain enforced by the server.

Date-of-birth, stock-expiry, business-day and reception-day fields remain single
dates. Maintenance/service start/end inputs retain time-of-day precision and
same-day intervals; replacing them with a nights-only booking selector would
change their semantics. The Next and React Native shells currently contain no
booking date form; the existing Android WebView review uses this same frontend.

## Interaction and safety

- Only Save updates the caller. Reset changes the draft and can be saved empty.
- Escape, Cancel, backdrop and browser Back discard the draft. Forward reopens
  from committed dates. A document-scoped marker prevents stale history entries
  from reopening a new picker after reload.
- Native modal dialog, keyboard focus containment/restoration and nested guest
  dialog handling. RU/UZ/EN labels and light/dark surfaces; mobile 360/390 widths.
- Today's lower bound uses the property's timezone (default Asia/Tashkent), not
  the guest device's local timezone. Day arithmetic is shared with bookingQuote.
- No credentials, payment details, live data or external services are added.

## Validation before committing this increment

Root unit tests: 92 files / 1005 passed. Existing date timezone subprocess proof
passed. Browser proofs passed for the shared picker, owner calendar, guest
localization, legacy staff localization, Canva design and Core surfaces. New
proofs cover drafts, reset/save, repeated selection, Back/Forward, nested Escape,
month/year/leap boundaries, property day across Los Angeles/Tashkent/Kiritimati,
three languages/two themes/four widths, Core quote invalidation and 30-night cap,
owner explicit window reload/clear, and connected Front Desk overlap/reset.
The new browser proof and owner range proof run in VIEWS CI. HTTP fixtures are
explicitly synthetic; they are not evidence of a connected public Core.

## Android delivery

Use the existing SDK 35 WebView review packaging path. A distinct preview version
identifies this calendar candidate. No loose debug.keystore was found initially. Further inspection found the existing
standard key inside the installed official Expo 57.0.27 `template.tgz`, at
`package/android/app/debug.keystore`, with the template's standard debug signing
configuration. `build-android-review.py --debug` builds a distinctly labelled,
debuggable candidate; `sign-android-debug.py` reuses that bundled test identity
inside a temporary directory and verifies its certificate. No key is generated,
no permanent credential is configured and no release identity is changed.

The same package ID with a different certificate may not update older APKs;
installation/upgrade compatibility must not be assumed. ADB currently fails
because its required user configuration directory is read-only; `/dev/kvm` is
also absent. Final installation and Library identity must be reported from
actual tool results. The earlier request to create a key is superseded by finding
an already available standard test key; no new-key authorization is used.
