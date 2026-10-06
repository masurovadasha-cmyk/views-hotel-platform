# VIEWS development handoff to Codex

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
