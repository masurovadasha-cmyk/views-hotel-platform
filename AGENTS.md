# VIEWS — instructions for Codex

## Start here

Read `docs/CODEX_HANDOFF.md` and `CODEX_START.md`, then inspect current Git status,
branch, recent commits and open PRs. They describe the saved checkpoint, not a
promise that its unfinished code passes tests. The active handoff branch is
`stage7/staff-email-delivery-v1`. The latest historically verified baseline is
Stage 7.25 / PR #53 / `5ebafbebecaf96c99022436830d0abddb979838d`.

## Owner constraints

- The only VIEWS source-of-truth repository is
  `masurovadasha-cmyk/views-hotel-platform`. Continue here; no new VIEWS repository,
  Floot rewrite, or migration into `vertex-app`.
- VIEWS remains separate from Vertex Vision, Taxi, Engineers and JARVIS. Future
  integration is through stable contracts, not shared mutable release code.
- No new paid resources, API spend, credit purchases or paid upgrades. Never
  claim any plan has unlimited/free usage. Stop at an unapproved spending gate.
- No merge into main, production deployment, real payments, external email,
  recurring automation, privilege expansion, or public tunnel without separate
  owner approval. Draft PRs and synthetic local tests are the default.
- Report progress to the user in Russian. Deliver runnable code, migrations,
  tests and evidence rather than just a plan. Do not claim unexecuted work done.

## Preserve the running installation and secrets

The Windows checkout is `C:\Users\user\Documents\VIEWS\views-hotel-platform`.
The existing local rehearsal is loopback-only: web 4173, Core 3001,
PostgreSQL 55432 / database `views_local`. Its data is persistent. Do not run a
reset/bootstrap/seed command blindly against it. Inspect the scripts first.
The default API boot without the local flags is NOT necessarily loopback-only.

Private configuration, invitation tokens, DB passwords and mail keys live under
`%LOCALAPPDATA%\VIEWS-Staging\private`, outside Git. Use only the narrowly needed
approved local helper; never print, commit, attach, or export these secrets.
Do not read browser profiles or account/session stores. Never replace a user's
password or convert a fixture role into an administrator.

Do not `git reset --hard`, `git clean`, force-push, drop databases, remove persistent
volumes or overwrite local uncommitted work. Root and apps/api package-lock.json
were pre-existing untracked files; do not delete or silently stage them. Preserve
snapshots and reconcile them explicitly. Applied migration checksums must never
be rewritten. Inspect `public.views_local_migrations` before changing migrations.
New corrections belong in the next migration when an earlier one is applied.

## Architecture and financial invariants

- PostgreSQL operational Core is authoritative. React web and Android share one
  frontend. The legacy Pages/D1 layer is not a substitute for Core.
- Keep organization/property isolation, backend permissions, RLS, outbox events,
  audit, idempotency and explicit delivery states. Use bigint minor money units.
- Provider transaction, ledger, reservation and inventory changes must be atomic.
  Unknown delivery means reconciliation, not an automatic financial resend.
- Network-capable Core code belongs in the existing security/egress boundary.
  SMTP runs in its explicitly isolated operator/worker module, not as an arbitrary
  runtime bypass. Do not weaken source gates or permissions to make tests green.
- Stage 7.25 staff authentication is local-only and nonprivileged. Real email,
  public HTTPS, privileged MFA, provider certification and production remain gates.
- A captured test email is not external delivery or verified email ownership.
  A green build is not a successful deployment. A generated APK is not proof of
  installation on a physical phone.

## Verification

From the repository root (after confirming installed dependencies):

```sh
npm run typecheck
npm test
npm run build
node scripts/core-network-primitive-gate.mjs
node --test scripts/staff-mail.acceptance.cjs
```

From `apps/api`:

```sh
npm run typecheck
npm run build
npx vitest run src/staff-auth
```

Inspect `.github/workflows/stage7-staff-email.yml` for the disposable PostgreSQL
and loopback SMTP integration. Its fixture URL/port is NOT the user's live local
DB configuration. Never run destructive fixture setup against `views_local` on
the user's computer. A cloud runner's 127.0.0.1 is not the user's Windows host.

On Windows use the existing user-space Node from
`%LOCALAPPDATA%\VIEWS-Staging\tools\node-v22.23.3-win-x64`; `npm.cmd`/`npx.cmd`
avoid PowerShell script policy issues. Inspect installed versions before changes.
Do not install Docker/WSL/services, change firewall rules or reboot silently.

For each increment, record exact tested SHA (or dirty-source status), commands,
exit codes, relevant scenario counts and explicit limitations. Preserve full SQL
errors locally without secrets; publish only safe diagnostics. Feed stdin to
Docker with `-i` when required, and validate nonempty machine evidence. Historical
Stage 7.19 assertions once failed to run despite process success; do not repeat it.

## Review and completion

Keep changes narrow, use existing modules, and maintain the stacked draft PR
base. Inspect remote branch drift before pushing. Stage 7.26 is the first task:
make its saved email-delivery code pass actual tests, review token/recipient/
lease/concurrency boundaries, and test the mail-link UI. Do not jump straight to
MFA while that prerequisite is unverified. Update the handoff and owner-facing
status only after evidence exists; treat old PR descriptions as dated reports.
