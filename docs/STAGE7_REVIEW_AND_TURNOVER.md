# Stage 7.37 — synthetic review, turnover and recovery

A document view now returns a signed receipt bound to organization, reservation,
document/checksum/update timestamp, membership and the specific live staff session.
New review decisions require that receipt within 60 seconds, a still-pending
unchanged file and the same locked local authorization. Accepting an expired
record is refused. The UI requires an explicit viewed-file acknowledgement and
accept/reject button. The receipt proves delivery to a session, not human cognition.

Decision, reservation version, command, outbox and audit commit together. Retry
keys bind the complete request; opposite decisions cannot reuse a key. A fresh
key cannot overwrite a terminal decision. An authorized exact completed replay
can return after receipt expiry, but never returns file content or the receipt.
Only the fixed synthetic vault is in this flow; real compliance routes remain
outside the staff gateway. No government registration is issued.

Migration 0047 adds an RLS-protected local_stay_turnovers table constrained to
marked, zero-charge checked-out reservations. Checkout atomically inserts a
pending task. The unit lock serializes checkout, new check-in and turnover
confirmation; new synthetic check-in refuses any pending task for its unit.
Reception lists pending tasks independently of the date selector and asks for
confirmation. Completion, command, outbox and audit are atomic and replayable.
This is front-desk confirmation of synthetic readiness, not a housekeeper role
assignment. The existing housekeeping.work role grants are unchanged.

Before migration, the 46-entry persistent ledger was inspected and a private
0600 dump retained as before-stage737.dump. No applied migration was edited.

## Recovery proof

cloud:test:restore exports a read-only repeatable-read snapshot of the owned
cloud installation and uses that snapshot for pg_dump. It restores into a new
random-port, loopback-only disposable PostgreSQL container, compares every public
and staff_private table by count and row digest, decrypts nonempty synthetic file
rows with the separate private key, confirms a wrong key fails, and verifies
nonempty turnover rows. The source is not reset or modified. Backups stay private;
the disposable restored container is removed. Restored application role passwords
and production runtime activation are explicitly not claimed.

## Executed evidence

Dirty continuation of 9e5c7c212365d41add9e59de46216e9fecf9fad4:
web/Core builds/typechecks passed; root 220 tests/36 files; Core 283/56 files;
mail policy 15; network gate 119 files. Integration cases include review forgery,
expiry, wrong session, concurrent replay, changed decision, event-failure rollback,
terminal rejection and pending turnover blocking the next arrival until completion.

Chromium passed 13 groups including explicit review, stale decision denial,
reload persistence and checkout→turnover→confirmation. Existing booking browser
regression passed on 360/390/768/1440 with gateway restart/logout. Staff HTTP passed
13 groups/32 calls. Initial browser assertion matched a status plus nested button
as one text node; the status is now a separate span and the full flow passed.

The first full local restore matched 71 tables including seven private auth tables,
six encrypted documents and one turnover. Subsequent counts grow only with
separate synthetic proofs. Exact clean-source reports remain private.
See CURRENT_DELIVERY_STATUS.md for the whole project, including unfinished
software blocks and external activation dependencies; this stage is not a blanket
production/readiness claim.

The complete local chain can be reproduced with `npm run cloud:verify`. It builds
web/Core, runs root/Core and boundary tests, restarts the owned rehearsal, exercises
HTTP/browser flows, and restores a consistent local snapshot. The separate
`cloud:test:passkey` runner requires stopping the rehearsal first because its
isolated SMTP/passkey proof owns the same loopback ports. Its 47 groups passed;
restore compared 70 tables/7 private tables with 8 recovery rows. Evidence-runner
acceptance also passed 85 tests.

Synthetic stays are explicitly refused by registration preparation and submission;
synthetic-vault documents are excluded from the verified-document selection even
for ordinary reservations. A Core test confirms refusal without provider attempts.
