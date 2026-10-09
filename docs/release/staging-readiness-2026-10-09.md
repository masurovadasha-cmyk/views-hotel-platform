# VIEWS staging release checklist — 2026-10-09

## Current build
Canonical repository: `masurovadasha-cmyk/views-hotel-platform`.
Development branch: `feat/views-service-core-stage-2-8`.
Workflow: `VIEWS Service Core`, which builds Node.js/PostgreSQL tests, a web snapshot, and a debug Android WebView shell.

The web snapshot contains frontend assets only. It is not a deployable full-stack website by itself. The Android APK requires a separately deployed HTTPS origin. Both are development artifacts, not customer releases.

## Blocking release gates
1. Implement production OIDC/OAuth2 login and verify JWKS, issuer, audience, expiry, tenant membership, and roles server-side. The current HMAC context token scheme is **development only**. `VIEWS_ALLOW_DEV_AUTH=1` explicitly opts into it for isolated testing; default startup fails closed.
2. Deploy a private PostgreSQL instance, apply migrations using a dedicated migration role, and use a separate non-owner application role with no `BYPASSRLS`.
3. Provide a private HTTPS ingress with valid TLS and allowlisted origins, secrets management, backup/restore and access logging. Do not expose the development token entry UI or service to the public Internet.
4. Replace the temporary PMS booking projection with authenticated canonical booking events, revocations and out-of-order replay tests.
5. Configure merchant sandbox adapters, verified provider webhooks and reconciliation. Do not enable live card charges.
6. Replace illustrative market pricing, service fees and compensation rates with approved commercial data.
7. Verify on actual Android hardware: login, WebView origin restrictions, lifecycle, back navigation, accessibility, API errors, and update path. Debug signing is not a release signing solution.
8. Run browser E2E tests against the private staging stack and compare with approved Canva screens. Current CI covers HTTP assets/API, not visual parity.
9. Publish release artifacts only after Node and PostgreSQL tests pass; keep exact commit SHA in the release notes.
10. Never merge the development PR or promote to production on CI success alone.

## Staging smoke flow
- `GET /health` confirms DB connectivity.
- Authenticate as a guest with an active, verified booking.
- List market catalog, create a test order, confirm server price snapshot and idempotency.
- Verify dispatcher only sees managed properties and can assign an eligible worker.
- Verify worker sees own task, progresses status and checklist, and cannot bypass custody requirements.
- Cancel another test order and verify stock reservations, task cancellation and audit.
- Inspect payment intents, events, refunds and finance view with non-money sandbox data.
- Verify cross-tenant and cross-principal access denial.
- Rebuild web and Android artifacts from the same tested commit.

## Operational status
No public staging URL or production deployment is verified. No real payments are enabled. The current Android APK is an HTTPS development launcher, not a standalone native hospitality app.
