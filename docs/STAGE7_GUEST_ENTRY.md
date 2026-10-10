# Stage 7.34 — primary guest entry in the local pilot

Reception can now add or replace the primary guest's name, date of birth and
country code for a confirmed, marked, zero-charge synthetic reservation. The
form explicitly asks for fictional data. Successful saving refreshes server
readiness, so a missing-guest blocker disappears without fabricating check-in.

The gateway requires CSRF, a live session, reservation.manage, a known workspace
reservation and an exact request shape. Core retains the local test-only pilot,
organization/property scope and transactional staff authorization locks. It
validates bounded names, an actual nonfuture date, a two-letter uppercase country
code and the expected reservation version. The code shape does not establish
citizenship or document validity.

The reservation lock serializes guest edits with stay transitions. A stale
version or a post-check-in edit is rejected. Idempotency binds the reservation
and canonical input; the same key cannot change its payload. Guest data, version,
command, audit and outbox commit together. Audit/outbox/result snapshots contain
IDs and version only, not names or birth dates. Linked guest profiles, document
records and registration cases block this replacement flow. No document upload,
verification status or external registration can be set through it.

The form retains the same key for unchanged retries. An uncertain response shows
an explicit error instead of claiming success. Closing refreshes the board; a
stale edit requires reopening. The form deliberately requires re-entry of all
fields and does not expose birth dates in the reception listing.

## Validation, 7 October 2026

Validation is recorded on the dirty continuation of
`9e8bea81b6aa49354ecfb7a86a7c9eb697e935ab`; final clean-source browser evidence is
stored privately by the existing proof runner. Web/Core build and typecheck,
220 root tests, 15 mail policy checks and the network gate (118 files) passed.
Staff HTTP proof passed 13 groups/32 calls. Chromium passed seven stay groups,
including guest form persistence, removal of the missing-guest blocker, stale
write refusal, unknown-field/CSRF/scope refusals and four form widths. Existing
booking/reception browser regression also passed.

New PostgreSQL cases cover concurrent replay, changed payload, stale version,
invalid dates, ordinary booking refusal, successful replacement, outbox-failure
rollback, PII-free audit snapshots and document-linked guest refusal. Full Core
results are recorded after the final run in the handoff.

The full run exposed an existing order-dependent compliance fixture: two suites
used the same residency-policy natural key with different IDs. The compliance
fixture now takes the actual ID returned by its upsert, so its document FK and
assertion refer to the row that exists. No assertion was removed.

No migrations or production activation. Real identity documents, government
registration, paid-stay rules and housekeeping remain separate work.
