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
npm ci
npm run typecheck
npm test
npm run build
npm run dev
```

## Cloudflare
Build command: `npm run build`, output: `dist`.
Pages Functions expose `/api/health` and `/api/readiness`.

## Codex cloud / Linux: connected development workspace

The Stage 7.25 source lives on `stage7/staff-auth-pilot-v1`; the current `main`
contains only the initial README. Use the existing checkout of this source or
its cloud-setup descendant. Cloud tasks are already isolated: do not create a
Git worktree unless explicitly requested.

See [the Linux cloud runbook](docs/CLOUD_LOCAL_DEVELOPMENT.md) for the real
PostgreSQL + Core + staff booking workspace, installation, login, checks and
restart instructions. `npm run dev` by itself runs the interface only.

## Staging preview

Preview deployments are built from `staging/master-reference-v1` with GitHub Actions. Production `main` remains unchanged until approval.
