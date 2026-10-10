# Stage 7.31 — reception day overview

The authenticated local workspace now includes a PostgreSQL reception projection,
separate from the last-50 reservation list. GET /local-api/reception accepts only
an optional day (YYYY-MM-DD or today); the gateway fixes the property from its
configuration. It uses the existing Core booking-workspace read route and
reservation.read permission, active session, actor binding and property/RLS checks.
No new business mutation, role grant, production flag or migration is introduced.

The selected day is interpreted in the property's timezone, not the browser's:

- Arrivals: currently confirmed reservations with scheduled check-in on that day.
- Departures: currently checked-in reservations with scheduled checkout that day.
- Staying: all currently checked-in reservations for the property, regardless of
  the selected date. This is expressly not a reconstructed historical occupancy.

Holds, cancellations, no-shows and checked-out stays do not enter those groups.
Each group returns at most 100 rows in deterministic check-in/ID order, with the
complete count and a truncation indicator. A single SQL statement calculates the
projection independently of the last-50 bookings page. Empty groups are explicit;
missing unit assignments remain visible. No guest names, documents or financial
state are returned. Invalid dates and extra gateway query parameters are refused.

The UI displays the selected report date and timezone. Refresh failures clear the
old projection instead of showing it as current; no demo rows replace failed
requests. It uses the existing staff CSRF/session handling. Mobile layout stacks
the groups. The screen explicitly states that check-in/checkout actions remain
unconnected and that the local dataset is synthetic.

## Verification — 7 October 2026 (Asia/Tashkent)

Executed against the dirty continuation of a8e6a41, with dirty-source status in
machine evidence. Web/Core builds and typechecks passed. Root suite: 220 tests /
36 files; Core disposable PostgreSQL suite: 265 tests / 54 files, including four
new reception groups. Mail policy: 15 tests; network gate: 116 files, no findings.
The reception tests use a separate front-desk membership in the disposable CI
fixture, not the persistent installation. Tests cover timezone midnight boundaries,
status selection, null unit assignments, permission/property refusal, invalid
dates, complete counts above the display cap, empty results and property-local today.

Staff HTTP regression passed 13 groups / 32 calls. Chromium verified the real
reception gateway, day selection, exclusion of a newly created hold, invalid date
and property-override refusal, four widths without overflow, and the existing
login → quote → hold → reload → release → gateway restart → logout journey.
No new migrations were applied (44 retained). Hosted CI, production deployment,
real check-in/checkout, guest registration and payment collection are not claimed.

## Next operational work

This is the read surface for reception, not completion of the hotel journey.
Implement and review explicit confirmation, guest-assignment and stay transition
contracts next, including permission, dates, required guest/compliance data,
financial prerequisites, idempotency, inventory, audit/outbox and rollback. Keep
those writes behind the existing local activation boundaries until verified.

Before saving, remote CI fixes 8d4f9d6 and 0903a01 were fast-forwarded without
conflicts or overwriting local work. Their separate evidence acceptance suite
passed 85 tests. The source work above remains based on a8e6a41; the final branch
also includes those CI-only fixes. Exact source/dirty flags in machine reports
remain authoritative.
