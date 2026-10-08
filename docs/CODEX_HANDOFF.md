# VIEWS development handoff to Codex

Latest 2026-10-08 continuation: see `CURRENT_DELIVERY_STATUS.md` and
`RELEASE_0_8_PREVIEW.md`. The owner explicitly requested updated public web/APK
publication. Core B1–B3 baseline is `4a61439`; the older checkpoint below is
historical. Public release is a disclosed interface preview; public Core/email,
real payments and physical Android UI acceptance remain incomplete.

Prepared 2026-10-07. Owner request: continue the entire VIEWS development workflow
in Codex, preserving existing work. This is a project handoff, not a production
release, not a complete transcript import, and not proof a Codex task has started.

## 1. Canonical project and immediate starting point

Repository: `masurovadasha-cmyk/views-hotel-platform`.
Active continuation branch: `stage7/staff-email-delivery-v1`.
Last historically verified source: `5ebafbebecaf96c99022436830d0abddb979838d`,
Stage 7.25, draft PR #53, parent `stage7/local-core-workspace-v1`.
The handoff checkpoint preserves Stage 7.26 work on top of that source.
The checkpoint is WIP: first run/review its tests; do not label it complete.

Before this handoff, the remote feature branch still pointed to Stage 7.25;
new email files existed on the PC and in a prepared Git tree not yet committed.
Prepared Git tree `0136df10985393a36e6150e577a8c41c84293196` contained the fuller
mail worker, SQL, tests, CI and UI. The handoff preserves that work, correcting an
obvious malformed ternary in its App.tsx, plus reconciles the PC's additive env/
migration-list changes. No verified Stage 7.26 external delivery is claimed.

Use `CODEX_START.md` as the first task. The root AGENTS.md holds owner constraints
and test commands. Existing stage docs describe earlier choices but may include
stale activation statements; current code, actual DB state and fresh evidence win.

## 2. Product and architecture to retain

VIEWS Hotel & Apartments is the standalone hospitality platform for Uzbekistan,
with later expansion to Asia and Europe. One domain model supports company-owned
inventory (PMS/CRM), future host marketplace, guest web/mobile, host workspace,
staff tools and administration. It must scale from current inventory to 100,
1,000 and potentially 10,000 units across properties, cities and countries.

Use the current modular Core, not a rewrite. Preserve tenant/property IDs, UUIDs,
permissions, audit, queues, idempotency, outbox/events and explicit state machines.
PostgreSQL is the transaction source of truth. React web and the Android review
wrapper use one frontend. External integrations stay behind reviewed boundaries.
Analytics/projections are separate from operational transactions.

Do not confuse this with the old `masurovadasha-cmyk/vertex-app` or attach Taxi,
Engineers, Vision or JARVIS code/data/releases to this repo. Future interoperability
is through stable APIs/events and ownership boundaries.

## 3. Milestones and evidence boundaries

| Stage | Saved implementation / previously reported proof | Important limit |
| --- | --- | --- |
| 7.14–7.17 | Core origin isolation, Tunnel replica observation, default-deny egress and controlled relay | No persistent public host/HA activation implied |
| 7.18 / PR46 | Provider-bound HTTPS/CONNECT client, TLS checks, response limits, no implicit retries | No real provider enabled; baseline acceptance was 71 tests |
| 7.19 / PR47 | Durable provider audit, stale/unknown reconciliation, leasing/outbox | Earlier shell proof missed Docker stdin; only later corrected SQL/Node proofs substantiate it |
| 7.20 / PR48 | Payme sandbox Merchant API lifecycle, atomic provider/payment/ledger/booking transactions, concurrency and rollback tests | Test fixtures, not Payme external certification or real payments |
| 7.21 / PR49 | Bounded unpaid-transaction expiry and inventory release; 26 scenario groups / 87 local HTTP calls reported | Recurring host service not activated |
| 7.22 / PR50 | Disabled staging maintenance supervisor, private reports, timeout/health controls; Pages/Workers diagnostic | Remote Cloudflare failure not fixed; no real persistent host |
| 7.23 / PR51 | Windows loopback Core/PostgreSQL; restore rehearsal compared 63 public tables | Not a private-auth-schema restore proof; no public tunnel |
| 7.24 / PR52 | Connected local quote → hold → reload → release workspace | Synthetic units/tariff, not all guest/CRM screens |
| 7.25 / PR53 | Invite/password login, scrypt, PostgreSQL sessions, revocation, backend permissions | Local nonprivileged pilot; no email verification/MFA production |
| 7.26 / current | Recipient-bound mail queue, SMTP/capture worker, token-link UI, tests and workflow saved | WIP until current code actually passes; external email remains OFF |

Stage 7.25 evidence recorded in PR53: 13 HTTP groups / 32 requests; Edge isolated
profile login/quote/hold/reload/release/gateway restart/logout; widths 360/390/768/
1440; selected API tests 27; root tests 215. Source/recorded runtime was
`5ebafbe`, no production activation. Re-run rather than transplant these counts
onto the new checkpoint. All earlier stage PRs are stacked drafts; no blanket
merge approval exists.

## 4. Windows environment and what was rechecked during handoff

Device: `WIN-TRCGF7Q3E01`, Desktop Commander ID
`1356080c-38fe-4ebe-9b2c-cc545416e1a5`.
Working directory: `C:\Users\user\Documents\VIEWS\views-hotel-platform`.
Private app data root: `%LOCALAPPDATA%\VIEWS-Staging`.

- User-space Node: `tools\node-v22.23.3-win-x64\node.exe`.
- User-space PostgreSQL: `tools\postgresql-16.15\pgsql\bin`.
- Web: `http://127.0.0.1:4173/?api=local-core`.
- Core readiness: `http://127.0.0.1:3001/readiness`.
- DB: `127.0.0.1:55432`, `views_local`, restricted runtime `views_app`.
- Private runtime/config/invitation files: `private\`; reports: `evidence\`;
  database data: `data\`; dumps: `backups\`. None belongs in source artifacts.
- Desktop shortcuts: VIEWS Local Start, VIEWS Local Stop, VIEWS Staff Invitation.
  The primary local-workspace@views.invalid user chooses their own password.

The PC briefly stopped responding in the preceding work. At handoff it answered
again, readiness returned ready/database ok, and the branch was still based at
5ebafbe with uncommitted Stage 7.26 files. database-bootstrap.json reported 40
applied migrations including 0040. Inspect the actual migration row/checksum
before edits; do not assume a reconnect means no earlier operation completed.
The local 0040 Git blob matched `318736148c7c93966ff4c76f55f7d950c57aa59e` and
staff-mail.cjs matched `f9b875eb346073f2d489c2d8678531d5bee52896`.

Installed desktop app registration was observed as
`OpenAI.Codex_2p2nqsd0c76g0!App` (display name ChatGPT). Codex CLI was not on PATH.
This establishes installed desktop software, not signed-in Codex access or a
started agent task. The current conversation is not automatically its history.

## 5. Stage 7.26 files and first engineering work

Main files:

- `apps/api/db/migrations/0040_staff_email_delivery.sql`
- `apps/api/ops/staff-mail.cjs`
- `scripts/staff-mail.acceptance.cjs`
- `scripts/staff-mail.integration.cjs`
- `.github/workflows/stage7-staff-email.yml`
- `src/features/local-core/staff-invitation-link.ts` and tests
- `src/features/local-core/StaffMailEntry.tsx`, wired through `src/App.tsx`
- `docs/STAGE7_STAFF_EMAIL_DELIVERY.md`

The queue stores job metadata and token digests, not raw bearer tokens/keys.
A worker-only HMAC key regenerates a token bound to tenant/member/recipient/
purpose/transport/key ID. Issuance is operator-only; claim/ready/finish live in
staff_mail_ops. Lease loss is uncertain, not blind resend. Actual SMTP acceptance
is distinguished from account proof; capture mode must NEVER verify a real email.
Nodemailer 10.0.15 is pinned in the WIP. Do not use personal Gmail or send through
a newly connected provider as an unapproved shortcut.

First Codex increment:

1. Preserve/check local and remote diff, migration 0040 checksum, package-lock
   state and data backups. Reconcile locally applied SQL with source before work.
2. Run root typecheck/build/tests, Core typecheck/build, mail unit tests and the
   dedicated disposable mail workflow. Diagnose failures, not just error counts.
3. Review SQL invariants and lock order: enqueue vs acceptance vs email change vs
   lease finish, tenant/recipient/credential-version binding, expired tokens,
   offboarding, duplicate issuance, insufficient grants and uncertain delivery.
4. Verify the link-to-UI flow including fragment cleanup, no token leakage, no
   activation on GET, explicit password POST, consumed/expired link failures,
   reset revocation, logged-in switching and responsive rendering. Browser proof
   for the new mail-link UI was NOT completed before handoff.
5. Preserve working Stage 7.25 login/booking regression. Test backup/restore for
   staff_private data and separately held keys before claiming recovery complete.
6. Publish exact SHA-bound evidence and a draft PR status. Only then plan MFA.

Do not run scripts/staff-mail.integration.cjs against the Windows DB. It expects
a disposable PostgreSQL instance with fixed fixture roles/URL and loopback SMTP.
A production label in a test's name does not make its role/settings safe for real
data. The initial migration disables unproven legacy 'email' labels; review this
migration effect before any new environment applies it.

## 6. Open release gates / ordered roadmap

Stage 7.26 must be verified first. Then: approved real SMTP service/sender and
recipient plus DNS/cost checks; actual receipt on HTTPS staging; audited invite/
recovery UX; privileged MFA/recovery; full guest/host/staff journey integration;
RU/UZ/EN and money/timezone/a11y completion; stable Android signing and emulator/
physical-device update tests; backup/restore, monitoring and production decision.
Sequence can be refined, but never skip security/activation gates or invent keys.

Cloudflare: root wrangler.toml is a Pages configuration. A local Workers deploy
--dry-run rejected it and Pages Functions compiled. This reproduced a mismatch,
not remote dashboard repair. Attached Workers Builds check remained failed.
Do not replace PostgreSQL Core with legacy Pages/D1 merely to get a green deploy.

Public review web/APK remains version 0.7.17-review, build 717004, static-demo;
its APK uses a temporary review signing key and is not the local staff/mail build.
Physical Android installation and stable upgrade signing remain unverified.
Never share a stale review APK as the result of the current server stage.

## 7. References to read in this repository

`docs/STAGE7_STAFF_AUTH_PILOT.md`, `docs/STAGE7_STAFF_EMAIL_DELIVERY.md`,
`docs/STAGE7_PAYME_ATOMICITY_PROOF.md`,
`docs/STAGE7_STAGING_MAINTENANCE_CONTROL.md`,
`docs/VIEWS_NEXT_DELIVERY_GATES.md`; PR53 and relevant preceding draft PRs.

Use current official provider documentation for external contracts. Do not treat
chat summaries, simulated SMTP receipts or historical CI statuses as fresh proof.
Any missing access/credential affects only that operation; continue useful code/
test work without fabricating external execution or incurring new costs.

## 8. Confirmed local reconciliation during the Codex handoff

The connected PC was rechecked. PostgreSQL migration 0040 was queried through
the restricted runtime role and its saved SHA-256 matched the local SQL bytes.
It is already APPLIED: do not edit it in place. Original local work was preserved
both in a named Git stash and a dated `VIEWS-Staging/handoff-backups` snapshot.
The GitHub WIP and local additions were reconciled without reset/clean, forced
push, database writes or restarting the running web/Core. The local additions
include migration 0040 in Production Core CI and disabled mail env examples.
Untracked lockfiles were deliberately left untouched. Current source != the
already running Stage 7.25 build until a later deliberate build/restart.

## 9. Cloud continuation after handoff

Stage 7.26 was continued in the existing branch and combined with the Linux
launcher. See `STAGE7_STAFF_EMAIL_VERIFICATION.md` for fresh executed results,
corrections and the next MFA design sequence. Applied migration 0040 remains
unchanged; 0041 contains revocation/lease fixes. Mail-link browser and private
schema restore proofs now run in the disposable mail workflow. Earlier WIP and
unverified-browser statements above describe the original checkpoint.
External delivery, privileged MFA, Windows rollout and production remain OFF.

## 10. Local passkey continuation

Stage 7.27 adds an opt-in, nonprivileged WebAuthn step-up pilot; see
`STAGE7_PASSKEY_PILOT.md`. New migration 0042 leaves applied mail migrations
unchanged. The existing branch/stack is preserved. Default staff login and
booking behavior remain unchanged; privileged MFA is NOT enabled. Continue next
with reviewed factor replacement/revocation and recovery, then enforce assurance
for approved privileged flows only after HTTPS/email/owner gates are satisfied.

## 11. Local recovery and replacement continuation

Stage 7.28 adds single-use recovery code issuance/rotation, replacement with
password plus an existing UV key or recovery code, and atomic old-key/code/
session revocation. See `STAGE7_PASSKEY_RECOVERY.md`. Migration 0043 preserves
applied 0042 and invalidates only pre-existing unfinished MFA ceremonies. The
local opt-in boundary remains; lost-all-factors recovery and privileged access
are not enabled. The combined disposable suite includes real Chromium recovery
flows, replay/concurrency failures and nonempty recovery-table restoration.

## 12. Transactional assurance continuation

Stage 7.29 protects authenticated password change for enrolled local staff.
Migration 0044 enforces session-bound fresh UV proof inside the password mutation,
including expiry after lock waits. The API maps denial to HTTP 403. Existing
password-only staff without a key retain their flow; privileged routes remain
closed. See `STAGE7_PASSWORD_ASSURANCE.md` for the boundary and proof commands.

## 13. Password assurance user flow

Stage 7.30 connects the password form to the existing passkey confirmation flow.
After a server assurance refusal it clears password fields, offers explicit key
confirmation and requires a new explicit password submission. Lost responses are
reported as unknown outcomes, without automatic retry. See
`STAGE7_PASSWORD_ASSURANCE_UX.md`; no new migration or privilege activation.

## 14. Reception overview continuation

Stage 7.31 adds a read-only reception projection and date selector: confirmed
arrivals, scheduled departures and current checked-in stays, scoped to the staff
property and its timezone. It reads PostgreSQL independently of the last-50 list;
no check-in/checkout write is enabled. See `STAGE7_RECEPTION_WORKSPACE.md` for
boundaries, executed evidence and the remaining operational transition work.

## 15. Local stay transitions

Stage 7.32 adds explicitly confirmed check-in/checkout for operator-prepared,
zero-charge synthetic stays. Migrations 0045–0046 lock live staff authorization through
the atomic state/inventory/audit/outbox mutation. The cloud-local launcher opts
into this bounded pilot; normal priced bookings and real guest/compliance/payment
processing remain excluded. See `STAGE7_LOCAL_STAY_PILOT.md` and the preparation/
browser proof commands. Applied earlier migrations remain immutable.

## 16. Synthetic guest readiness

Stage 7.33 adds a primary-guest card and server-projected readiness reasons to
the local stay pilot. Missing guest, invalid inventory, inactive unit, payment
intent, timing or occupancy blocks the UI action; the transactional write still
rechecks every prerequisite. No guest editing or document verification is
implied. See `STAGE7_STAY_READINESS.md` for verification and remaining scope.

## 17. Local primary guest entry

Stage 7.34 adds explicit primary guest entry/replacement before synthetic check-in,
with strict input shape, optimistic reservation version, payload-bound idempotency
and atomic guest/version/command/audit/outbox writes. Document/profile/registration
links prevent replacement. The form never claims document verification. See
`STAGE7_GUEST_ENTRY.md`. No migration or production activation.

Dirty continuation of 9e8bea8: web/Core builds and typechecks passed; root 220,
Core 274 tests / 55 files, mail policy 15, network gate 118 files. Staff HTTP:
13 groups/32 calls; stay browser: seven groups; booking browser: four widths and
restart/logout regression passed. A browser rerun after restart with an older
auth fixture timed out before reaching the stay card; running the documented
`cloud:test:auth` prerequisite to create a fresh synthetic identity followed by
`cloud:test:stay` passed. Keep that order for reproducible browser evidence.
The compliance fixture's order-dependent residency-policy FK was corrected;
the full disposable Core suite then passed twice. Remaining work includes the
separate document review workflow and real operational integration gates.

## 18. Document status and verification integrity

Stage 7.35 projects bounded, non-file document statuses into the local reception
card, including expiry overriding historical verification and a guest-edit lock.
The existing compliance service rejects incomplete/rejected/expired documents
and disconnected vaults; verification/audit/outbox are atomic and a delayed
finalization cannot overwrite verified content. See `STAGE7_DOCUMENT_STATUS.md`.
Real file upload/viewing/manual review is still blocked by the absent vault
adapter and is not exposed by the local staff gateway.

Dirty continuation of 3c7f3ab: web/Core builds and typechecks passed, root 220,
Core 278 / 55 files, mail policy 15, network gate 118 files. Staff HTTP proof:
13 groups/32 calls; stay browser: eight groups including document status and
expiry; booking/reception regression passed on four widths with restart/logout.
No new migration; 46 retained. Final clean-commit HTTP/browser reports are kept
outside Git and include source SHA and dirty flag.

## 19. Encrypted synthetic document preview

Stage 7.36 adds an operator-prepared fixed-text encrypted file and authenticated
preview, with AES-GCM identity binding, separate persisted private key, no-store
responses and per-view audit. The preview is local/test-only and accepts no real
file content. See `STAGE7_SYNTHETIC_DOCUMENT_PREVIEW.md`; private key backup is
necessary alongside any DB restore containing these synthetic blobs.

Dirty continuation of a666564: web/Core build/typecheck passed; root 220/36,
Core 280/56, mail policy 15, network gate 119 files. Staff HTTP: 13 groups/32 calls;
stay browser: 11 groups, including reading the same encrypted file after a full
owned Core/gateway restart, manual/timed close, cache headers, CSRF/scope and
post-logout refusal. Booking regression also passed on four widths. No migrations;
46 retained. Final clean-source HTTP/browser reports remain private with SHA and
dirty flag. Actual document uploads/review/registration and production remain OFF.

## 20. Complete local review → stay → turnover chain

Stage 7.37 adds short-lived session-bound review receipts and atomic accept/reject
for the already-viewed synthetic file, plus migration 0047 for pending turnover
after checkout and explicit front-desk confirmation. Pending turnover blocks the
next synthetic check-in. Synthetic stays/documents cannot enter real registration
preparation/submission. No existing role grants were expanded.

See STAGE7_REVIEW_AND_TURNOVER.md and CURRENT_DELIVERY_STATUS.md. The latter lists
all project gates honestly, including unfinished localization/onboarding/real
housekeeping software as well as external provider/hosting/Android requirements.

Dirty continuation of 9e5c7c2: root 220, Core 283/56 files, network 119 files, mail
policy 15, CI evidence acceptance 85, combined mail/passkey 47 groups passed.
Staff HTTP 13 groups/32 calls; complete stay browser 13 groups; booking regression
four widths with restart/logout. Full consistent local restore matched 71 tables
(7 private), 6 encrypted documents and 1 turnover; separate disposable auth restore
matched 70 tables/7 private and 8 recovery rows. Local has one extra migration
ledger table. No production/physical-device/hosted-CI success is claimed.

`npm run cloud:verify` is the complete local verification command; private reports
record exact SHA/dirty status. `cloud:test:restore` keeps the source read-only and
uses a new disposable container. The live rehearsal retains 47 immutable migrations.

## 21. Connected default entry and workspace navigation

Stage 7.38 fixes the dedicated HTTP loopback server on port 4173 opening the
legacy Live API when the URL had no query parameter. It now defaults to the
authenticated PostgreSQL workspace. Explicit demo/live modes and public origins
retain their previous behavior. Section links reach reception/turnover, booking,
passkeys and account without unmounting active forms. No grants or API changes.

Dirty continuation of 02bf81eb27df5a9a5411730d9ae025aa518d08f9:
web build and root 221 tests/36 files passed. Staff HTTP 13 groups/32 calls and
stay browser 13 groups passed. Booking browser passed from the actual bare URL
with four widths, navigation, reload, gateway restart and logout. Repeated tests
on an old fixture hit the intended account login rate limit (HTTP 429); the stay
runner now reports that safe diagnostic instead of a later card timeout. Keep
cloud:test:auth before browser proofs to prepare a new synthetic identity; do not
relax rate limits. No existing accounts changed. Clean-source reports remain in
the private evidence directory with exact SHA and dirty status. Remaining delivery
gates are listed in CURRENT_DELIVERY_STATUS.md; production is not enabled.

## 22. Android source recovery (native build incomplete)

Recovered historical native review shell and packaging helper from 02a6322 into
the active branch. Explicit Android demo query fixes current frontend routing.
Packaging now emits unsigned output only, never a new ephemeral signing identity.
See STAGE7_ANDROID_SOURCE_RECOVERY.md for dependencies and exact limitations.
Dirty continuation of 367377ce19fcabd50bc0f1b4796e30ba904b5b7d: frontend
typecheck/build:pages, root 222 tests/36 files and browser proof at the Android
asset origin passed. External photo attempts are blocked (4), not successful
network requests. Python packaging syntax passed; actual native packaging exits
1 because SDK configuration is absent, and javac is also missing. No APK built,
no native/device/signing/update proof claimed. Root-mounted web build restored.

## 23. Native unsigned Android packaging verified

Stage 7.40 resolves SDK/JDK prerequisites under /workspace/android-tools, with
pinned upstream downloads, SHA-256 checking and a repeatable user-space installer.
No signing identity is created. See STAGE7_ANDROID_SOURCE_RECOVERY.md.

Clean ce81ad0c1d653e44d16fca23d5b1b3421c9521fb: build:pages, browser asset-origin
proof and native unsigned packaging passed. Dirty continuation adds all-four-file
asset comparison, zipalign verification and rejection of a root-mounted web build;
positive native build and negative wrong-base check both passed. Installer cached
rerun passed. Android 26 minimum / 35 target, version 738001, unsigned artifact
290711 bytes. Java emits deprecation/source-8 warnings, no compilation failures.
Final exact source/artifact checksums are in ignored review-output/build-evidence.json.
No emulator/device execution, stable signature, in-place upgrade or connected
mobile backend proof. Root-mounted local web build restored after packaging.

## 24. Offline Android review photographs

Stage 7.41 embeds the four existing demo CDN images in the shared Vite build;
provenance and SHA-256 are recorded alongside assets. No live inventory is added.
The browser proof now rejects every external request and checks loaded listing
and detail photos, reload and four widths. Booking detail image has alt text.

Dirty continuation of ee2cf373b488be8a6f90e7381317604e2ee7b546: build:pages,
222 root tests / 36 files, expanded asset-origin browser proof and native unsigned
packaging passed. All eight web assets matched their APK copies. Final clean SHA
and artifact checksum are recorded in ignored review-output/build-evidence.json.
No signing, emulator, physical-device or connected mobile claim. Restore the
ordinary root web build after Android packaging; no public release is performed.

## 25. Native WebView compatibility; emulator UI not accepted

Stage 7.42 discovered native WebView 74 rejecting optional chaining/nullish syntax
in the ordinary web bundle. build:android transpiles for chrome74 and emits a
required packaging marker; demo guest/staff labels no longer use replaceAll.
The browser proof removes that API and checks guest/staff navigation as well as
photos/reload/four widths. Dirty continuation of cb29adc9dfed580f0414fb4e07fa0fa0e30d46f6:
222 tests/36 files, Android build, browser regression and unsigned packaging pass.

Native Android 10 install with temporary test-only signing passed. After the fix
launch returned Status: ok and the prior syntax error disappeared, but software
GPU font/raster failures prevented usable UI acceptance. No /dev/kvm is available;
attempted renderer flags did not resolve it. No native UI/physical-device success
is claimed. See STAGE7_ANDROID_WEBVIEW_COMPATIBILITY.md; optional verified emulator
tooling is reproducible. Owned emulator/ADB container stopped, release unchanged.

## 26. Delivery preparation, build isolation and honest failure states

Stage 7.43 separates Android dist-android from web dist, fixing APK builds
overwriting the running loopback web assets. Android browser proof confirms
no external requests, four widths, guest/staff navigation and the SMS unavailable
dialog with keyboard focus restoration; the false SMS-delivered/verified flow
is removed. Native WebView failures now replace the broken view with a retry
panel; compilation passes, native recovery UI acceptance remains unproven.

Existing-key signing requires a clean matching build, expected public certificate
pin, private external secret files and verified unsigned checksum/manifest/assets.
Ten disposable signing checks pass; no permanent identity is generated or replaced.
See STAGE7_ANDROID_SIGNING_AND_DELIVERY.md for secure configuration and limits.

Full clean 6ce5fcc cloud:verify passed: root 222/36, Core 283/56, mail policy 15,
HTTP 13 groups/32 calls, stay 13 groups, booking four widths. Full restore matched
71 tables/7 private, 12 encrypted documents and 5 turnovers. Dirty continuation:
root 222, Android/browser/packaging, unchanged web hash across Android build,
10 signing guards, combined mail/passkey 47 groups/60 HTTP calls passed. The
mail fixture initially refused occupied ports, then needed root-built assets;
Android output isolation fixes that build collision. Persistent runtime restarted.

Android 15/WebView 124 installed but software emulation produced renderer crash
and System UI ANR; native UI acceptance still fails. Owned emulator/ADB stopped,
temporary emulator key removed. User confirmed no host/domain/permanent Android
key yet. Public GitHub checks at 6ce5fcc show verify/mail success and Workers
Builds failure; external Cloudflare diagnostic logs are still unavailable.
Remaining localization and owner/housekeeper software are explicitly OPEN, not
credential blockers. No whole-product, production or physical-device completion
is claimed. Final private reports identify the exact final SHA/dirty state.

## 27. Dedicated front-desk turnover queue

Stage 7.44 adds a responsive searchable/sortable pending-turnover panel, partial
projection warning and separate navigation. Check-in/out/readiness confirmations
use a focus-managed keyboard modal. Core permissions, commands and migrations
remain unchanged. This does not enable a cleaner role or staff assignment.

Dirty continuation of b5d0402afd68c07e88a7618a3206774f674e7bda passed web/Core
builds, root 222/36, staff-auth 20/3, network gate 119 files, mail policy 15,
HTTP 13 groups/32 calls, stay browser 16 groups, booking/restart/navigation and
four widths. Stay proof separately labels its UI-only truncated projection;
real local writes/reloads still exercise Core. Initial accessible-name and
focus-restoration failures were fixed before passing. Final clean-source private
reports retain exact SHA/dirty fields. See STAGE7_TURNOVER_WORKSPACE.md.
Owner/cleaner workflows and complete localization remain unfinished software;
hosting, permanent Android signing and real provider activation remain gated.

## 28. Connected staff workspace in three languages

Stage 7.45 adds 264 RU-source messages with EN/UZ translations, language selection
and safe preference storage. All current local staff screens are covered, including
security warnings/recovery, guest/document controls, reception, booking and turnover.
Dates retain operational timezone; money retains bigint precision. Language changes
preserve forms, previews and operation keys without new network requests.

Dirty continuation of 44782b5f74944f4cfc6fadc6c9f1a58d7db608c0: web/Core builds
and typechecks, root 228/37, staff-auth 20/3, network gate 119, mail policy 15,
HTTP 13 groups/32 calls, locale browser eight groups, Russian stay 16 groups and
booking/restart/four widths passed. Disposable mail/passkey 47 groups/60 calls,
17 loopback SMTP captures passed; persistent runtime restarted without new
migrations. Android frontend/asset-origin regression passed; no new native proof.

Prepare a fresh cloud:test:auth identity before the third browser suite: auth uses
six of the eight permitted login attempts. cloud:verify now refreshes the fixture
before locale proof. Browser login errors report HTTP status without credentials.
Final clean-source locale/booking reports record their own SHA/dirty state.
See STAGE7_STAFF_LOCALIZATION.md for evidence and limits. Guest/demo localization,
owner/cleaner software, native-speaker review and external release gates remain.

## 29. Guest localization and preview navigation

Stage 7.46 adds a separate RU/UZ/EN guest preference and 223 catalog messages,
including public email entry, static apartment data, preview steps and accessibility
labels. Shared safe interpolation retains existing staff behavior. Desktop guest
navigation, favorites and help search now work. Modal keyboard/focus handling is
implemented; SMS focus no longer restarts with each parent callback identity.

The legacy connected booking Details action now displays the selected server
record instead of apartments[0]. Failure/retry and two distinct bookings are
covered by intercepted synthetic responses; this is not PostgreSQL guest Core
integration. Demo service/chat controls and booking/confirmation previews explicitly
state their limits. No new permission/provider/production activation occurred.

Dirty continuation of 75612486975c3d92866a55bacceae6daae864d04 passed web build,
root 233/38, Core build/typecheck, staff-auth 20/3, mail policy 15, network gate 119,
staff HTTP 13 groups/32 calls, staff locale eight groups and booking browser. Guest
browser passed seven groups on web and Android-target assets across three languages
and four widths; original Android offline-photo/navigation/SMS proof also passed.
Final clean-source artifact reports record SHA/dirty status. See
STAGE7_GUEST_LOCALIZATION.md. Native device, permanent signing/publication, real
guest/provider integration, owner/cleaner and legacy staff localization remain open.


## 30. Stage 7.47–7.48 — owner draft and housekeeper software

Added atomic default-off owner inventory drafting, existing authority locking,
exact minor money and retries; no active units/rates are created. Added separate
scoped synthetic housekeeper queue, self-claim/release/complete, locked session
authority, explicit confirmation, audit/outbox and replay. No guest data is in
the queue. New screens are RU/UZ/EN. Existing accounts/roles are unchanged.

Dirty base 664df32: root 238/39, disposable Core 298/59, network gate 126 files,
mail policy 15, builds/typechecks and both offline role UI proofs passed. After
persistent restart migrations 0048–0049 were applied with prior checksums intact;
auth/stay/booking/locale proofs passed. Restore matched 71 tables, 7 private
tables, 24 encrypted documents and 16 turnovers. Flags remain off in the normal
launcher. Owner login is still gated by the identity pilot. New housekeeper
credentials exist only in disposable CI fixtures. Browser role proofs use
synthetic HTTP responses: do not call them connected role onboarding.

See STAGE7_OWNER_AND_HOUSEKEEPING.md and CURRENT_DELIVERY_STATUS.md. Continue
legacy staff localization and real inventory/role/provider integration only
within their stated scope. No main merge, public deployment or new APK release.


## 31. Stage 7.49–7.50 — legacy CRM languages and connected cleaner proof

Legacy CRM's eight components now use 547 RU/UZ/EN catalog entries, preserving
API enums, user data, canonical BigInt analytics and separate guest/staff
preferences. Mobile role navigation/sheet close and inbox filters work. Fake
photo capture and inert demo listing/assignment/filter controls are disabled.

Dirty base eb812dc: root 241/40; disposable Core 298/59 and 5 actual-password
housekeeper HTTP/browser groups passed. The new bounded
`npm run cloud:test:housekeeping` requires ports 3001/4173 free, starts the actual
AppModule/gateway against its own marked disposable DB and restarts the owned
persistent environment via the documented trap. Never run fixture setup on the
persistent database. Normal launcher role flags remain off; owner login is still
gated. After proof the persistent launcher reported 49 migrations, none new.

Web/Android builds, legacy browser 7 groups on each target, guest 7 groups on each,
offline role proofs, front-desk auth 13/32 HTTP, locale 8 and booking browser
passed. Network gate 126 files and mail policy 15 passed. Fresh unsigned native
package compiled with 9 matching assets; no permanent signing, publication or
physical-device proof. See STAGE7_LEGACY_CRM_AND_CONNECTED_HOUSEKEEPING.md for
exact dirty artifact hash and limits. `cloud:verify` now includes the offline
legacy proof, but not the fixed-port connected housekeeper runner.

First real property's details were requested asynchronously. Do not invent
business data or claim access to the user's other chat. Real guest/vault/payment/
registration, privileged role rollout, multi-category inventory editing and
sales/hosting/signing acceptance remain open in CURRENT_DELIVERY_STATUS.md.


## 32. Stage 7.51 — multi-category draft inventory editor

The owner workspace now loads and atomically edits its previously created drafts:
up to 20 categories/100 rooms, occupancy, room codes, exact UZS base prices and
independent cancellation windows. Existing room IDs survive code swaps; Core
supports moves, deletion and addition. A stored-state revision prevents stale
writes; serialized idempotency recovers lost replies. Audit/outbox and all edits
roll back together. Existing seasonal/weekday/adjustment rules and operational
records block this draft-only editor. Changed cancellation terms create a fresh
inactive policy and retain the prior policy. No migration or role promotion.

Dirty base a4e1f36: root 242/40; disposable PostgreSQL Core 310/61; focused staff
auth 23/3; network gate 128 files; mail acceptance 15; web/Core/Android-frontend
builds/typechecks passed. Owner create/edit and housekeeping UI proofs passed;
new editor six groups on both web and Android-target assets, three languages and
four widths. Browser owner responses remain fixtures; actual PostgreSQL tests
cover concurrency, rollback, IDs, authority and draft-only invariants. Normal
restart ready with 49 migrations, none new; persistent auth 13 groups/32 HTTP and
booking/restart browser passed. No new native APK or privileged-login proof.

See STAGE7_INVENTORY_EDITING.md. Normal feature flags remain off and existing
identity restrictions stand. This completes the requested local draft-editing
block without a host/domain. Real business data, privileged role rollout, sales
activation, operational inventory changes and external provider/release gates
remain separate; do not repeat the obsolete multi-category-editing backlog item.


## 33. Stage 7.52 — complete product scope and manual owner calendar

The owner supplied the full specification on 8 October 2026. PRODUCT_REQUIREMENTS.md
now records one Core / three layers, complete MVP/V2/V3 features, roles/countries,
Telegram and frontend/mobile gaps, invariants, performance targets, and externally
unverified legal/market assertions. Prior short status lists were not the whole
product backlog. Do not call Vite/WebView Next.js or Flutter/React Native delivery.

Added default-off VIEWS_OWNER_CALENDAR_ENABLED for existing owner/manager authority
on active UZ/Tashkent platform inventory. The API/UI lists occupied periods and
creates/removes manual maintenance/host_block records in the existing inventory
EXCLUDE table. No new migration. Outbox provenance and exact interval matching
protect bookings/holds/external or altered periods. Expired unreleased holds stay
visible. Writes/audit/outbox are atomic; replay never recreates a removed block.

Dirty base 26b61ab: root 243/40, disposable Core 320/63, network 130, mail 15,
web/Core builds/typechecks and all owner/housekeeper browser proofs passed. New
calendar UI has five groups, three languages/four widths, with HTTP fixtures;
actual Core tests include a race against BookingHoldService. No privileged owner
login, native APK or public activation proof. See STAGE7_OWNER_CALENDAR.md.

Found production-core CI only applied migrations through 0046. Replaced the
stale manual list with the complete ordered chain; local disposable tests apply
all 49 and workflow YAML parses. Hosted CI success still needs observation.
Persistent restart reported ready with 49 migrations/zero new; auth 13/32 HTTP
and booking/restart browser passed. Normal flags remain off and startup contract
is unchanged. Next local block:
calendar pricing/restrictions preserving existing price/policy snapshots, then
PMS processes and connected guest flows under the full requirements map.


## 34. Owner's new execution order: stages B0–B11, one at a time

The latest instruction supersedes the previous automatic calendar-pricing queue.
Start with B0, then B1 schema audit/compatible extensions, B2 backend, B3 payments,
B4 CRM API, B5 registration/taxes, B6 guest, B7 CRM/staff mobile, B8 host/admin,
B9 communication, B10 integration and B11 quality/release. Historic Stage7 numbers
are not completion claims for B7. See docs/stages-b/00-plan-and-assumptions.md and
ADRs 0003–0006. B0 is a documentation/planning delivery, not an application release.

Confirmed answers: 500 apartments in Tashkent, Samarkand, Bukhara and Khiva. Owner
currently uses Codex alone; developer, tester, manager and accountant are planned.
No legal entity or payment/SMS/fiscal/E-mehmon partners yet. Prepare replaceable
adapters and explicit test providers. Six-month plan is conditional, not a promise
that all V2/V3 or real integrations are complete by April 2027. Existing 100-row
UI limits require pagination/import work before accepting a 500-unit launch.

Uncommitted owner-rates WIP was already started before this steering. Preserve it:
owner-operating-property.ts, owner-rates.input/store/service.ts; edits in owner
calendar service/controller/module, local gateway, staff guard, quote service.
Core typecheck passed, functional tests/UI not implemented. This WIP is not part
of the B0 docs commit, not enabled, not rebuilt into the running Core and not a
finished pricing stage. Reconcile/test it in B2/B8; do not blindly restore/delete
these files or claim the whole working tree clean. No production/account changes.

Next authorized work: B1 audit existing migrations/ledger first, then add only
missing schema/index/RLS/fixtures in a disposable environment. Questions about
city distribution/provider contracts do not block this local schema analysis.

## 35. Stage B1 — compatible operational registries

Added migrations 0050–0053, twelve FORCE-RLS registries, compound tenant/property/currency FKs, strict actor permission helper, immutable folio reversals, service snapshots/transitions, serialized promo limits, completed-stay loyalty, draft-only payouts, disputes and blind review constraints. Existing 49 migration checksums untouched; persistent views_local ledger inspected at 49 and no seed/reset performed. New seeds require the disposable DB marker; independent synthetic accountant only, no existing account promotion or credentials. Reviews intentionally have no runtime submission policy until B8 participant auth; payouts cannot execute.

Dirty source on 5fc4555: Core 327/64 plus seven rollback-only admin SQL proof groups; root 243/40; web/Core typecheck/build; network134, mail15 pass. See stages-b/01-database.md for schema, risks and exact scope. Workflow/local disposable runner use the same seed and constraints. Persistent migration/restart and hosted CI not yet run. Pricing WIP from before B0 remains separate and is next in B2. User explicitly requests sequential autonomous progress; do not ask to continue.

## 36. B2 backend pricing/search increment

Finished the preserved pre-B0 rates WIP: API/BFF, guarded local flag, optimistic revision/idempotency/audit/outbox, coherent quote lock, frozen prior quotes and holds. Added scoped staff inventory search with filter-bound cursor; actual disposable test traverses 500 synthetic units. Quote validates capacity/residency/active property/policy tenant. Hold create/confirm/release now verify active actor and reservation.manage before idempotent replay. Owner calendar race fixture now uses the existing manager for its booking side (no role expansion).

Dirty 2e635db: Core359/67; root245/40; API typecheck/build pass. See stages-b/02-backend.md. B2 is not complete: cancellation policy refund must coexist with full-refund recovery; SMS account signup still absent (existing guest SMS port only delivers reservation access). Next work is cancellation/refund budgeting, not a claim that B2 is done. Before upgrade restore proof passed71 tables/25 encrypted docs/17 turnovers. Persistent DB still49 at this checkpoint; four B1 migrations not yet applied there.

## 37. B2 policy cancellation / refund delivery safety

Added applied migration0054: immutable policy cancellation + per-capture refund limits. Default-off local-only BookingCancellationService/POST v1/bookings/:id/cancel allocates actual paid money above frozen penalty; atomic inventory release, ledger reclassification, refund request, audit/outbox; active scoped permission checked before replay. Rejects prior refund workflows, finalized economics, started stays, inconsistent captures/periods. Recovery preserves partial limits; late new captures return separately. Refund worker routes ambiguous failure/expired processing lease to uncertain, missing adapter to blocked; retries only typed proven-not-sent. No auto resend after uncertain. No provider connection or public activation.

Dirty68fed3b final Core375/70 + B1 SQL7, root245/40, API/web typechecks/builds, network139/mail15. Actual runtime upgraded49->54 (5new) retaining data. Auth13/32HTTP and browser hold/reload/release passed. Backup+restore before upgrade71 tables and after85 tables, encrypted documents25/turnovers17 preserved with matching digests. Current local service still loopback, standard flags off. See stages-b/02-cancellation-and-refunds.md.

B2 remains open: true SMS account signup is not the existing reservation-access link flow; no selected provider. Public guest search/total-price UI, participant cancellation UI and provider acceptance remain. User requests all stages sequentially, no continue questions. B3–B11 are not declared complete; use full PRODUCT_REQUIREMENTS and B0 ADR/sprints. Next local software block is account SMS challenge/session design with explicit disconnected delivery (no fake SMS), followed by B3 provider contracts/reconciliation/deposit/finance work. Do not skip remaining programming by calling every gap an external credential blocker.

## 38. B2 guest SMS account core

Added migration0055 private OTP/session storage and narrow definer functions, GuestIdentityModule/HTTP endpoints, empty-by-default SMS delivery registry. Local pilot only with separate hex OTP key; no live SMS adapter. HMAC codes, max5 attempts committed on failure, 5-minute TTL, resend/adversarial races serialized, bounded network/phone rate limits, 7-day hashed sessions/logout. New guest user has no employee membership; existing phone identity reused. Synthetic adapter lives only in tests; no runtime fake-success capture. No new providers, expenses or live credentials.

Core383/71 plus B1 SQL7 and new rollback SMS expiry/NULL/supersession/account proof pass; API typecheck/build and network143 pass. Read stages-b/02-guest-sms-identity.md. Restore checker now includes guest_identity_private schema (previously public/staff_private only). Migration0055 was not applied to persistent DB at code checkpoint (54 currently); disposable tests include55. Earlier section37 statement that SMS programming is absent is superseded. Remaining provider delivery/public guest app acceptance stays open; programmatic B2 slices now exist. Continue B3, starting ledger idempotency payload comparison/concurrency and provider readiness, keeping Click/Uzum disconnected until contracts are verified.

## 39. B3 ledger idempotency and database integrity

Ledger command replay now compares reference/account/side/exact amount/currency, with org/key advisory serialization; incompatible payload/draft rejects. Existing account metadata is not overwritten; account creation uses stable order. New migration0056 guards INSERT as well as both journals during moves, serializes entry writes with posting, verifies account tenant/currency, and fixes account identity after creation. Old0008 remains unchanged. Persistent preflight at55 showed0 account tenant/currency mismatches.

Dirty448d4b2 Core392/72 plus B1/SMS SQL, root245/40, API/web builds/typechecks, network144/mail15 pass (final log views-b3-accepted.log). Nine new actual PostgreSQL ledger groups cover payloads, concurrency, allocation, posted insertion/move/deletion, scope/currency and posting race. Migration0055 already applied persistently with normal startup; restore87 tables/private9,25 docs/17 turnovers matched. B3 full scope remains open per stages-b/03-payments-and-finance.md: Click/Uzum concrete adapters, deposits, reconciliation UI, certified fiscalization and legal payout execution. Do not claim all stages complete or call guest_deposits accounting a card authorization. Next increments must preserve one-stage-at-a-time user instruction and clearly distinguish software backlog from missing contracts.

### Verified persistent checkpoint after section39

Code commit `e98ae98d3b2b5dfdab3d5a748855752cb90ef1b7` was pushed to the existing branch (fast-forward from5fc4555; main untouched). Normal restart applied0056: persistent ledger56, only1 new at this final restart. Exact clean-code auth proof passed13 groups/32HTTP; restore87 tables/private9,25 encrypted documents/17 turnovers all digests matched. HTTP smoke confirmed guest SMS pilot404 GUEST_IDENTITY_DISABLED and payment providers empty. Standard runtime remains loopback-only. Browser proof just before this migration also passed; hosted CI not observed. No environment startup/install contract changed; existing supported helper remains the startup instruction. Documentation checkpoint follows without runtime changes.


## 40. B3 refund reconciliation workspace and callback races

New migration0057 adds append-only payment_refund_reviews with FORCE RLS, existing finance.read/manage, actor/property/request-state validation, immutable history and scoped indices. Core refund-reconciliation list/detail/reviews APIs, existing session guard and CSRF BFF; RU/UZ/EN staff UI with bounded pagination/history, exact money, read-only mode, frozen idempotent retries and stale-state rejection. Reviews never send money, mark a refund complete or requeue uncertain. No permissions granted to existing users. Unknown provider errors/worker IDs remain private.

Verified callbacks now match uncertain/blocked, require consistent amount/capture/refund IDs and reject ambiguity atomically. Completion clears lease/worker; late worker ack/timeout cannot overwrite it and reports superseded. A refund-ID-only verified callback persists its request's capture link so recovery cannot requeue the same amount. Synthetic partial-expiry payment test formerly used a different refund ID than its provider ack: fixture corrected, stricter validation retained.

Verified dirty60c03eb: Core404/73 + B1/SMS rollback SQL; root246/40; API/web typecheck/build, network147/mail15. Browser5 synthetic HTTP groups cover three languages/widths, bigint, lost response exact retry, stale state, pagination/offline, reader without form. Actual runtime57 migrations (1new), auth13/32HTTP, restore88 tables/private9, documents25/turnovers17 digests match/source unmodified. No actor request returns401. Logs /tmp/views-b3-reconciliation-{core-final,root,web-build,browser,runtime,auth,restore}.log. All commands exit0 after the documented first fixture mismatch; no tests bypassed.

Read docs/stages-b/03-refund-reconciliation.md for API/run/manual acceptance/risks. B3 is still open: concrete Click/Uzum protocol adapters, authenticated provider lookup and resolution of blocked/uncertain without callback, bank authorization/void/capture deposit, fiscal provider, legal payout model. Current review history is not bank reconciliation evidence; no manual completed/resend endpoint. UI browser uses HTTP fixtures, not live provider or full financial browser-to-Core proof. Persistent accountant identity was not created or promoted. Public host/production release/new APK/main merge remain absent. Keep stages sequential; B4–B11 not declared done. Existing environment setup/start instructions remain sufficient, no new secret/config requirements.


## 41. Guest email account browser increment

Latest owner steering prioritizes email entry for the guest after backend0058
(commit1e09005). Added guest-core runtime for explicit loopback only, pre-React
fragment consumption preserving staff invitations, RU/UZ/EN profile/request/
confirm/session restore/logout UI, offline/manual retry states. Separate ops
cookie gateway: HttpOnly/SameSite/Path scope, CSRF logout, strict Origin/Host,
no actor headers, fixed loopback Core and no staff proxy. All pilot flags remain
required; review Worker refuses guest-api. No persistent DB change or real mail.

Dirty1e09005: Core417/74, root261/44, network150/mail15, both typechecks/builds,
four real browser/Core/PG/SMTP groups and three HTTP groups passed; two captured
synthetic messages. First test counter included an intentionally rejected exchange;
fixed relative count, re-run passed. Workflow now executes the browser proof.
See stages-b/02-guest-email-browser.md for commands, current proof and limitations.
Standard cloud:start is unchanged; new gateway runs only inside disposable proof.
Public preview/APK unchanged; no main merge. Next code scope: participant-owned
guest booking access, not fake bookings after authenticated profile. Public HTTPS,
real mail adapter and external-provider acceptance remain open gates.


## 42. Guest-owned trips read flow

Added0059 indexes and narrow session-hash SECURITY DEFINER projection; unchanged
staff RLS. GuestEmail session is resolved again inside the SQL statement. Ownership
requires profiles.user_id + reservation.primary_guest_id and matching organizations
across guest/reservation/property; email matches and companion rows grant nothing.
Default-off VIEWS_GUEST_TRIPS_PILOT_ENABLED, list/detail APIs, cookie BFF projection,
RU/UZ/EN UI,20-row microsecond-safe keyset pages and exact minor money.401 clears
cookie/UI; missing and foreign trips return404. No direct guest table RLS grant.

Dirtyfa48ea1: Core424/75, root264/45, network152/mail15, typechecks/builds;4 new actual
browser/Core/PG groups plus existing4 browser and3 HTTP/SMTP passed. New unit test
caught undefined cursor coercion; explicit string validation fixed it.0059 only
applied to disposable DB; persistent state untouched. No new external services,
public deployment or APK. See stages-b/02-guest-owned-trips.md for run/manual risks.

No association API yet: profiles must already have a trusted explicit user_id;
fixtures are not a production linking process. Next block is verified reservation
association with audit, never automatic email matching or client-supplied userId.
Guest cancellation/payment and real email/public Core remain unfinished.


## 43. Reservation-scoped guest invitation and acceptance

0060 adds a private FORCE-RLS link registry and scoped SECURITY DEFINER issue,
inspect, revoke and preview/accept functions.0061 extends guest trip projection
for an accepted reservation grant; never writes guest_profiles.user_id or exposes
other stays sharing that profile. Staff session+permission+property scope and
recipient guest email session are required. One-hour pending HMAC code, hashed
storage, stable issue replay, explicit confirmation, locks, audit and atomic
linked/unlinked outbox. Revocation and primary guest changes close reads.

Default-off local/test flag VIEWS_GUEST_LINK_PILOT_ENABLED and separate64hex
VIEWS_GUEST_LINK_TOKEN_KEY. Manual handoff only; no invitation mail adapter.
RU/UZ/EN guest preview/accept with recovery after lost reply; staff panel supports
issue/status recovery/revoke without returning the token on GET. Cookie/CSRF
boundaries retained. Real staff HTTP plus guest browser tested end-to-end;
staff panel itself still requires manual browser acceptance.

Dirty17065b9: Core430/76, root267/46, API/web typechecks/builds, network154/mail15;
4 new link browser/Core/PG groups plus4 owned-trip,4 email and3 HTTP/SMTP pass.
Review build public entry regression passes4 directions/3 languages/4 widths.
Logs /tmp/views-guest-link-{core,root}.log.0060/61 applied only to disposable DB;
old migrations and persistent views_local untouched. No public release/APK,
real mail, main merge or role promotion. See stages-b/02-guest-reservation-link.md.
Section42 association backlog is superseded by this manual invitation process.
Next code increment: guest cancellation preview/confirmation with frozen policy;
real mail/public Core and remaining stages remain open. Existing environment
startup is unchanged; the disposable test runner supplies and restores new flags.
