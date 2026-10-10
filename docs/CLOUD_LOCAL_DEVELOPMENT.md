# Linux cloud development for VIEWS

This starts the existing Stage 7.26 React application, NestJS Core and PostgreSQL
16. It reuses the existing staff invitation, password, session, quote, hold and
release implementations. The workspace contains explicitly synthetic apartments
and tariffs. Production staff enrolment, email delivery, payments, Cloudflare
publication and the Android APK are not activated by these commands.

## Repository and prerequisites

The initial `main` branch contains only README.md. The source used here is commit
`5ebafbebecaf96c99022436830d0abddb979838d` from `stage7/staff-auth-pilot-v1`, plus
the Linux setup changes in this branch. Continue from this checkout. Each cloud
task is isolated; do not create a Git worktree unless the user requests one.

Requires Linux, Node.js 22 or newer (validated with 24.19.0), npm, and a running
Docker daemon. The official PostgreSQL 16.15 image is pinned by digest in the
launcher. Container state is stored under `/workspace/.views-local/data`, so a
filesystem snapshot retains it. Live processes and Docker metadata must be
restarted/recreated by the launcher after restoration. Restoration in a new
cloud task still needs a separate check; a local restart does not prove it.

Run from `/workspace/views-hotel-platform`:

```sh
export npm_config_cache=/workspace/.cache/npm
npm ci --no-audit --no-fund
npm --prefix apps/api ci --no-audit --no-fund
docker pull postgres@sha256:0ea6700a3b4f0ae6ce746519073558aed4d88a79d8d07622a9a644946c7319c4
npm run build
npm --prefix apps/api run typecheck
npm --prefix apps/api run build
npm run cloud:start
npm run cloud:status
```

`cloud:start` initializes the local database once, applies all 46 current
migrations with checksum tracking, prepares the existing synthetic workspace,
issues an invitation if needed, and starts Core plus the staff web gateway.
Repeated starts retain database rows, credentials, invitations and running
processes. Migration checksums are saved in the same transaction as each
migration. A changed applied migration is an error, never silently accepted.

Optional `VIEWS_LOCAL_STATE_DIR` selects another absolute state directory outside
the checkout. Its root and private directory must belong to the current user
and have mode 0700. The default is `/workspace/.views-local`. Generated local
database/service secrets and one-time invitations stay in its mode-0600 private
files. Do not print, commit or copy their values into cloud configuration.

## Login and workflow

All listeners use loopback: PostgreSQL 55432, Core 3001, web 4173. The web route
is `/?api=local-core`. The onboarding UI does not provide a localhost preview;
these endpoints are for requests and browser checks inside the environment.
Do not expose or tunnel the rehearsal gateway as a public application.

The initial synthetic employee is `local-workspace@views.invalid`. Its one-time
invitation is stored in `/workspace/.views-local/private/staff-invitation.txt`.
Use the invitation form and choose a password through a browser running in this
environment. Never paste the invitation or password into chat. No email is sent
and email ownership is not marked verified. Privileged roles remain excluded
from the pilot. The browser proof below uses its own separate test employee.

The connected journey is login → server quote → hold → reload → release → logout.
Reservations persist in PostgreSQL; the existing broad guest/CRM demonstration
screens are not all connected to Core by this setup. `/readiness` must return
`{"status":"ready","database":"ok"}`; an open port alone is insufficient.

## Verification

```sh
npm test -- --maxWorkers=2 --minWorkers=1
npm run cloud:test:core
npm run cloud:test:auth
npm run cloud:test:browser
```

`cloud:test:core` creates a fresh temporary PostgreSQL container, applies the
canonical migrations and CI fixture SQL, verifies restricted-role tenant
isolation and no-overbooking, and runs the entire Core suite. It removes only
its own disposable container. It never resets the development database.

`cloud:test:auth` creates a separate synthetic unprivileged employee. It exercises
invitation replay, password login, CSRF, property access, quote/hold/release,
logout, password change, suspension, session expiry and reset. Its private
browser fixture is used by `cloud:test:browser`, which runs installed Chromium
(`/usr/bin/chromium`, overridable with `VIEWS_BROWSER_EXECUTABLE`) in a separate
profile. The browser test checks booking persistence, gateway restart, logout,
service credential non-exposure and widths 360/390/768/1440. It sends no email and
makes no external payment calls. Reports and screenshots are in the state
directory's `evidence` subdirectory, not in Git.

## Disposable mail and restore proof

After building Core and web, stop the owned development services with
`npm run cloud:stop`, then run `npm run cloud:test:mail`. This refuses occupied
ports 55432/3001/4173, creates its own marked disposable database, and runs actual
loopback SMTP, Core HTTP, Chromium link workflows and a full database restore
including `staff_private`. The derivation keyring stays in process memory outside
the backup. Evidence in `mail-evidence/` excludes tokens, passwords, email bodies
and database dumps. Run `npm run cloud:start` afterward to resume development.
Playwright is pinned in the root lockfile; Chromium must be installed separately
(system `/usr/bin/chromium`, or `VIEWS_BROWSER_EXECUTABLE`). CI installs Chromium
using Playwright. Never run the fixture against the persistent development DB.

`npm run cloud:test:passkey` runs the same disposable suite with the Stage 7.27
passkey pilot and Stage 7.28 recovery enabled, adding a Chromium virtual authenticator and actual
registration/step-up/replay/revocation/recovery tests. The normal launcher leaves this
feature off. See `STAGE7_PASSKEY_PILOT.md` for the current scope and MFA gates.

## Stop, restart and diagnose

```sh
npm run cloud:stop
npm run cloud:start
npm run cloud:status
```

Stop preserves the database and private configuration. Process ownership is
checked using UID, boot ID, kernel start time and command arguments before a
signal is sent. An occupied unrelated port or mismatched process/container
record is an error. The launcher never kills arbitrary listeners or deletes an
existing data directory. Logs are in `/workspace/.views-local/logs`.

Windows launchers retain their existing paths and behavior. Shared fixture and
proof scripts permit Linux only with explicit `VIEWS_CLOUD_REHEARSAL=true` and
an owned private state directory. Existing Host, Origin, CSRF, cookie, Core
authentication, property scope and production restrictions remain enforced.

Before public operation, complete the already-documented Stage 7.25 email,
privileged MFA and HTTPS deployment work, supply the actual integration
credentials through secure environment settings, and validate that deployment.
Saving the onboarding draft does not publish the environment or the website.

Stage 7.32 enables the zero-charge synthetic stay pilot in the cloud-local launcher.
Use `npm run cloud:prepare:stay` to add one separate synthetic stay (no existing
reservation changes). `npm run cloud:test:stay` follows cloud:test:auth and tests
the explicit check-in/checkout UI; see STAGE7_LOCAL_STAY_PILOT.md.


## Bounded housekeeper browser proof

Stage 7.50 adds `npm run cloud:test:housekeeping`. It runs the disposable Core
suite plus actual password → gateway → Core → PostgreSQL → browser task actions.
It does not activate a cleaner in the persistent rehearsal. Build Core and web,
then free only the owned web/Core listeners and restore them even if proof fails:

```sh
npm --prefix apps/api run build
npm run build
npm run cloud:stop
(trap 'npm run cloud:start' EXIT; npm run cloud:test:housekeeping)
```

The owned disposable database uses a random loopback port, marker and generated
credentials. The HTTP harness refuses occupied 3001/4173, binds loopback itself
and never changes the production bootstrap. Owner inventory and housekeeping
flags remain off in ordinary startup. See
`STAGE7_LEGACY_CRM_AND_CONNECTED_HOUSEKEEPING.md` for tested scope.
