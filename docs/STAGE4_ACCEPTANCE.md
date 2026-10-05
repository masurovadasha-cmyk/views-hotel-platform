# Stage 4 Acceptance Checklist

Stage 4 is accepted only when all mandatory gates are green on the same staging SHA.

## Mandatory automated gates

- [ ] VIEWS CI
  - production dependency audit
  - TypeScript
  - Vitest
  - production build
- [ ] VIEWS D1 Schema
  - all D1 migrations apply in lexical order
  - foreign-key check passes
- [ ] VIEWS Production Core
  - PostgreSQL production migrations
  - no-overbooking exclusion
  - tenant/property isolation
  - restricted runtime DB role
  - API typecheck/tests/build
- [ ] VIEWS Stage 4 Local E2E
  - Pages Functions start
  - readiness schema check
  - passwordless cookie login
  - Front Desk check-in/check-out
  - turnover housekeeping
  - manager verification
  - unit returns to ready
  - Guest360 / Stay Card / Timeline
  - Team workload / assignment
  - integration status
  - outbox processing drains ready events
  - retry/dead-letter metrics remain clean
  - outbox processor claims events with short-lived leases
  - no active outbox leases remain after drain
  - Finance read model identifies PostgreSQL as source of truth
  - live money remains disabled in the D1 projection
  - Front Desk cannot access Finance projection
  - unbalanced posted finance journals = 0
- [ ] VIEWS Staging Preview
- [ ] Recovery command validation

## Remote Cloudflare acceptance

Required before declaring remote staging complete:

- [ ] CLOUDFLARE_API_TOKEN configured
- [ ] CLOUDFLARE_ACCOUNT_ID configured
- [ ] D1 migrations applied remotely
- [ ] Pages staging deployment succeeds
- [ ] /api/health passes
- [ ] /api/readiness passes
- [ ] remote Stage 4 Golden Flow passes
- [ ] outbox pending/retrying/dead-letter are clean after processing
- [ ] outbox active leases return to 0 after processing
- [ ] Finance read model reports PostgreSQL source of truth
- [ ] live money remains disabled in D1
- [ ] unbalanced posted finance journals = 0

If Cloudflare credentials are absent, the credential-aware workflow may be green while remote deployment steps are skipped. That is not equivalent to remote staging acceptance.

## Release discipline

- Production \`main\` remains unchanged until explicit approval.
- No force-push to staging during acceptance.
- Database restore requires operator decision and the recovery runbook.
- Database exports are never committed to Git.
