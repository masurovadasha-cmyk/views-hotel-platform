# Cloudflare staging — $0 path

Stage 4 uses Cloudflare Pages + Pages Functions + D1 for the live staging path. Production `main` is not deployed by this workflow.

## GitHub environment

Environment: `views-cloudflare-staging`

Required secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

Required repository variable:

- `CLOUDFLARE_STAGING_ENABLED=true`

Optional repository variable:

- `VIEWS_STAGING_EXTRA_ORIGINS` — comma-separated extra staging origins, for example a custom staging domain.

Until `CLOUDFLARE_STAGING_ENABLED` is true, the Cloudflare job safely skips and GitHub Pages remains the static preview.

## What the workflow provisions

The workflow is idempotent and reuses resources when they already exist:

- Pages project: `views-hotel-platform`
- Production branch metadata on the Pages project: `main`
- Preview deployment branch: `staging`
- D1 database: `views-staging`
- Pages Function binding: `DB`

The D1 database id is resolved at runtime and written only into a generated preview Wrangler config. No Cloudflare database id or token is committed to Git.

Preview runtime variables are generated as:

- `VIEWS_ENV=staging`
- `VIEWS_ALLOW_DEMO_HEADERS=false`
- `VIEWS_EXPOSE_LOGIN_TOKEN=false`
- `VIEWS_ALLOWED_ORIGINS=<stable staging origin>[,<optional extra origins>]`

## D1 migration order

Wrangler applies every unapplied file in `migrations/` in lexical order:

1. `0001_core.sql`
2. `0002_seed_staging.sql`
3. `0003_integrations.sql`
4. `0004_auth.sql`
5. `0005_operations_exceptions.sql`
6. `0006_operations_events.sql`

The staging seed contains only synthetic accounts and no real guest personal data.

## Stage 4 deployment checks

After deploy the workflow verifies:

1. `/api/health` returns `status=ok`.
2. `/api/readiness` confirms D1 is bound and queryable.
3. A CI-only passwordless token is inserted directly into D1 for the synthetic front-desk account.
4. `/api/auth-verify` creates a secure cookie session.
5. `/api/session` resolves that live staff session.
6. The authenticated staff session creates a concierge service order.
7. The same session moves the order `new → accepted → done`.

The CI token is never returned by the public login endpoint. This keeps staging testable without exposing a public staff bypass.

## Authorization boundary

Operational endpoints must resolve identity through `resolveSession()`. Direct authorization from `x-views-demo-role`, `x-views-user-id`, or `x-views-guest-id` is not allowed.

Demo headers, when explicitly enabled for an isolated staging environment, are interpreted only by `resolveSession()`; they are disabled in the Cloudflare staging workflow.
