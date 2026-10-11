# Stage 6.9 — Staff Dashboard BFF / Core Identity Bridge

Status: implementation candidate.

## Goal

Connect the existing Pages/D1 Staff UI to the canonical PostgreSQL analytics Dashboard schema v2
without exposing internal Core actor headers or server secrets to the browser.

The browser continues to call same-origin Pages Functions:

`GET /api/analytics-dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD`

Optional:

`propertyId=<local D1 property id>`

The Pages Function then performs the server-to-server Core request.

## Why an identity bridge is required

The Pages/D1 application and PostgreSQL Core currently use different identity namespaces.

Examples:

- D1 user ID: `u-manager`
- D1 property ID: `utower`
- Core identity/property IDs: UUIDs

Those IDs must never be assumed equivalent.

Migration:

- `migrations/0013_core_identity_bridge.sql`

Tables:

- `core_identity_links`
- `core_property_links`

No production mapping is seeded or guessed.

## Mapping contract

Staff identity mapping is scoped by:

- local organization ID
- local user ID

It resolves:

- Core organization UUID
- Core user UUID
- Core membership UUID

Property mapping is scoped by:

- local organization ID
- local property ID

It resolves:

- Core property UUID

Malformed UUID mappings fail closed.

## Example operator linking

Use real IDs only after both identity records exist.

D1 example:

```sql
INSERT INTO core_identity_links(
  local_organization_id,
  local_user_id,
  core_organization_id,
  core_user_id,
  core_membership_id
) VALUES(
  'views',
  'u-manager',
  '<real-core-organization-uuid>',
  '<real-core-user-uuid>',
  '<real-core-membership-uuid>'
)
ON CONFLICT(local_organization_id,local_user_id)
DO UPDATE SET
  core_organization_id=excluded.core_organization_id,
  core_user_id=excluded.core_user_id,
  core_membership_id=excluded.core_membership_id,
  is_active=1,
  updated_at=CURRENT_TIMESTAMP;

INSERT INTO core_property_links(
  local_organization_id,
  local_property_id,
  core_property_id
) VALUES(
  'views',
  'utower',
  '<real-core-property-uuid>'
)
ON CONFLICT(local_organization_id,local_property_id)
DO UPDATE SET
  core_property_id=excluded.core_property_id,
  is_active=1,
  updated_at=CURRENT_TIMESTAMP;
```

Do not use CI fixture UUIDs as staging/production identity unless they are confirmed to be the
actual records in that environment.

## Server-to-server authentication

Pages secret:

- `VIEWS_CORE_API_KEY`

Core secret:

- `VIEWS_INTERNAL_API_KEY`

They must contain the same high-entropy value and be at least 32 characters.

The values are server-side only.

Do not expose them through:

- `VITE_*`
- browser JavaScript
- response payloads
- telemetry
- logs

Core production startup fails when `VIEWS_INTERNAL_API_KEY` is missing.

Dashboard Core requests require:

- `X-Views-Internal-Key`
- Core organization UUID
- Core user UUID
- Core membership UUID
- request ID

Internal-key comparison is constant-time after hashing.

## Pages BFF authorization

The BFF:

1. resolves the HttpOnly `views_session` cookie;
2. rejects guest sessions;
3. resolves the explicit D1 -> Core actor mapping;
4. for property requests, checks local D1 property scope first;
5. resolves the explicit local -> Core property mapping;
6. calls the canonical Core Dashboard endpoint;
7. forwards only safe ETag/cache headers and JSON.

The BFF never returns:

- internal API key
- Core actor headers
- Core mapping-table rows

## Fail-closed states

Expected explicit errors:

- `CORE_IDENTITY_NOT_LINKED`
- `CORE_PROPERTY_NOT_LINKED`
- `CORE_API_NOT_CONFIGURED`
- `CORE_API_KEY_NOT_CONFIGURED`
- `CORE_API_URL_INSECURE`
- `CORE_API_UNAVAILABLE`

No demo UUID fallback exists.

## HTTPS boundary

When `VIEWS_ENV=production`, the Core URL must use HTTPS.

Userinfo and URL fragments are rejected.

## Readiness

Pages readiness now requires:

- `core_identity_links`
- `core_property_links`

This proves that the D1 migration reached the environment. It does not claim that a particular user
has already been linked.

## Staff UI

Management LiveDashboard now has a canonical analytics panel.

Roles currently shown the analytics panel:

- general_manager
- super_admin

The analytics request is isolated from operational requests.

If the Core bridge is unavailable or not linked:

- operational dashboard remains usable;
- analytics panel reports the bridge state separately;
- no synthetic occupancy/revenue values are displayed.

## Money display

The UI does not guess currency decimal conventions.

ADR, RevPAR, gross and net amounts are labeled as minor units and remain separated by currency.

## Automated acceptance

Tests verify:

- explicit Core identity resolution;
- malformed or missing mapping fails closed;
- local property scope is checked before property mapping;
- production Core URL must be HTTPS;
- server key is required;
- BFF forwards Core actor context only server-side;
- response does not expose the internal key;
- unlinked identity does not call Core;
- local `utower` is translated to the mapped Core property UUID;
- Core service rejects a missing/mismatched internal key;
- root typecheck/build validates the management UI integration.

## Remaining deployment work

Before remote staging can show canonical analytics:

- configure the Core API URL in Pages;
- configure matching Pages/Core internal secrets;
- deploy/apply D1 migration 0013;
- create real identity mappings;
- create real property mappings;
- deploy Core API containing Dashboard schema v2;
- run remote dashboard smoke test.

Production `main` remains unchanged until explicit release approval.
