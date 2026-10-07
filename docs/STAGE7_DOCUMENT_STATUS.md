# Stage 7.35 — document status and verification integrity

Reception now displays a bounded summary of the primary guest's document records
for the existing marked, zero-charge local stay pilot. The summary contains only
type, recorded status, a local-date expiry flag and a finalized-upload boolean.
It returns total count and at most ten entries. It does not return document IDs,
numbers, object keys, URLs, checksums, images, birth dates or vault secrets.
Ordinary reservations do not receive this projection.

The UI distinguishes missing documents, unfinished upload, pending review,
rejection and expiry. Expiry overrides a historical verified label. Document
links also disable guest replacement in the UI, matching the existing server
refusal. These statuses are not a government registration or legal-compliance
verdict and do not change the synthetic check-in contract.

The existing compliance verification service now requires a confirmed/checked-in
reservation, pending or previously verified state, a valid finalized SHA-256,
nonexpired document in the property's current local date, a snapshotted residency
policy ID and a connected vault adapter. It evaluates expiry after lock waits.
Concurrent verification serializes on the reservation/document and produces one
audit record and outbox event. Event insertion failure rolls back verification.
Audit contains status and actor/entity IDs, never document contents.

Finalization now conditionally writes only a pending document with no checksum
or the same checksum. A delayed vault response cannot overwrite a document that
was verified/rejected in the meantime, or replace its already finalized bytes.
These conflicts map to HTTP 409. This change does not certify external vault
integrity or implement a human file-viewing workflow.

## Verification — 7 October 2026

Dirty continuation of `3c7f3ab291e13330febaacde1a36d4f64322bfb6`:

- Web/Core build and typecheck passed.
- Root: 220 tests / 36 files; disposable Core: 278 tests / 55 files, all passed.
- Mail policy: 15 passed; network gate: 118 files, no findings.
- New Core cases cover bounded/private document projection, invalid checksum,
  unfinished upload, rejected/expired/disconnected documents, concurrent replay,
  audit cardinality, outbox rollback and a vault response arriving after verify.
- Browser/HTTP results are recorded in the handoff after completion. The browser
  creates a separate synthetic stay with four metadata-only records using the
  explicit `--document-statuses` fixture option; no identity file is uploaded.
  Its historical verified record is expired and must not show as valid.

No migrations; the persistent rehearsal retains 46. Existing reservations and
accounts are not rewritten by fixture preparation.

## Remaining integration

No real document vault adapter is registered in this runtime. The local staff
session guard still does not expose compliance upload/finalize/verify routes.
Before real document work, implement and validate the selected storage adapter,
regional/encryption configuration, authorized short-lived file viewing, and a
human review flow with live session authorization. Existing metadata/status
checks are not sufficient to establish a person's identity. External government
registration, production and real payments remain disabled.
