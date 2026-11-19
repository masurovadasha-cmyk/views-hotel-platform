# VIEWS Hotel & Apartments

Standalone hospitality platform for VIEWS.

**Master Reference v1.0** — premium black / warm ivory / white / champagne-gold experience with strict Guest vs Staff/Admin separation.

## Stack
- React + TypeScript + Vite
- Domain-first hospitality core
- Cloudflare Pages / Functions ready
- Cloudflare D1 staging schema
- Vitest
- GitHub Actions CI

## Product surfaces
Guest: Explore, apartment details, booking flow, bookings, services, concierge/messages, profile.
Staff: role-scoped CRM, Inbox/My Tasks, Front Desk, Housekeeping, Maintenance, Host Desk, Finance, Admin.

## Safety rules
- Never invent nightly rates, fees, ratings, occupancy or financial KPIs.
- Payment UI hands off to a provider; VIEWS never collects raw card details.
- Staff authorization is role + property scoped.
- Production and legacy Vertex repositories are not part of this codebase.

## Local
```bash
npx --yes --package=pnpm@10.18.3 pnpm install --frozen-lockfile
npx --yes --package=pnpm@10.18.3 pnpm workspace:check
npm run dev
```

Node24.19.0 and pnpm10.18.3 are the verified toolchain. `pnpm-lock.yaml` is the
only dependency lock; do not use `npm ci`/`npm install` for project dependencies.
Existing `npm run ...` commands remain supported. See [workspace setup](docs/M0A_WORKSPACE.md).

## Cloudflare
Build command: `npm run build`, output: `dist`.
Pages Functions expose `/api/health` and `/api/readiness`.

## Local development

The current main line includes the VIEWS source and the V Market catalog
preview. `npm run dev` starts the web interface only. The connected staff/Core
rehearsal additionally requires PostgreSQL and Docker; see [the Linux cloud
runbook](docs/CLOUD_LOCAL_DEVELOPMENT.md) for its setup, login and restart
instructions. Keep that synthetic rehearsal loopback-only.

## Staging preview

Preview deployments are built from `staging/master-reference-v1` with GitHub
Actions. Merging source into `main` does not by itself publish the staging
preview or activate production services.
