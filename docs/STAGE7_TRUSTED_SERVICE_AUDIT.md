# Stage 7.3 — Trusted Service Request Audit

Status: implementation candidate.

## Goal

Create a durable, centralized audit trail for authenticated server-to-server Core requests without
storing raw secrets, request bodies, cookies, Authorization headers or query strings.

Stage 7.1 protects trusted actor headers.
Stage 7.2 supports zero-downtime internal-key rotation.
Stage 7.3 adds explicit trusted-service identity and durable request outcome audit.

## Trusted service identity

Every request that sends:

- `X-Views-Internal-Key`

must also send:

- `X-Views-Service-Id`

Service IDs are short canonical codes:

- `pages-bff`
- `analytics-cron`
- future examples: `channel-manager`, `admin-worker`

Format:

`^[a-z0-9][a-z0-9._:-]{1,63}$`

A valid internal key without a valid service ID is rejected before controller execution.

## Key fingerprint

After the internal key has passed constant-time verification, Core derives:

`SHA-256(key)[0:32 hex chars]`

The fingerprint is stored only for identifying which accepted credential was used.

The raw key is never persisted.

During a Stage 7.2 rotation window, current and previous keys produce different fingerprints, which
lets operators verify whether any trusted caller still uses the previous key without exposing either
secret.

## Database

Migration:

- `0028_internal_service_request_audit.sql`

Table:

- `internal_service_request_audit`

Recorded fields:

- organization UUID when a valid actor triplet is present;
- actor user UUID;
- actor membership UUID;
- trusted service ID;
- key fingerprint;
- request ID;
- HTTP method;
- stable controller/handler endpoint identity;
- HTTP status;
- outcome: started / succeeded / failed;
- normalized error code;
- start/completion timestamps;
- duration milliseconds.

The audit does not store:

- raw internal key;
- Authorization;
- cookies;
- request body;
- response body;
- query string;
- email/phone/guest document content.

## Fail-closed begin

The global interceptor authenticates the service identity and creates a durable `started` audit row
before controller execution.

If the audit begin cannot be persisted, the trusted request does not run.

This prevents a trusted business action from executing with no audit row at all.

Completion updates the same row with final HTTP outcome.

A completion-write failure does not rewrite the already executed controller result; the existing
`started` row remains visible as an incomplete audit signal.

## Global coverage

`InternalServiceAuditInterceptor` is registered through Nest `APP_INTERCEPTOR`.

It applies to every HTTP request that contains a valid internal key, including:

- Pages BFF dashboard calls;
- actor-context staff/service calls;
- internal analytics/report-cycle calls;
- future trusted Core service requests.

Public requests with no internal key are not written to this table.

Invalid/untrusted key attempts remain blocked by authentication and are outside the trusted-request
audit scope.

## Actor context

When all actor UUID headers are valid, the audit stores:

- organization;
- user;
- membership.

System-level internal jobs with no actor context are audited with null actor fields.

Malformed actor IDs are not persisted as free-form strings.

## Endpoint identity

The audit records the stable Nest controller + handler identity, for example:

- `AnalyticsDashboardController.summary`
- `AnalyticsInternalJobsController.reportCycle`

It does not record the raw URL or query string.

This avoids accidentally persisting user-controlled query data or dynamic IDs as endpoint metadata.

## Read API

`GET /v1/security/internal-service-audit?limit=100&serviceId=pages-bff`

Allowed roles:

- owner;
- manager;
- platform_admin.

PostgreSQL RLS additionally restricts rows to the current organization.

Scoped host/front-desk/operational roles cannot read the audit.

System-level rows without organization context remain available to database/platform operations, not
ordinary tenant audit reads.

## Pages BFF

The Stage 6.9 dashboard BFF now sends:

- `X-Views-Service-Id: pages-bff`

The browser never sees this trusted Core request.

## Analytics Cron

The Stage 6.10 internal report-cycle caller must send:

- `X-Views-Internal-Key`
- `X-Views-Service-Id: analytics-cron`

A browser must never call the internal report-cycle endpoint.

## Automated acceptance

Tests verify:

- current/previous key fingerprints are stable and different;
- valid key without service ID is rejected;
- invalid service IDs are rejected;
- Pages BFF sends `pages-bff`;
- global interceptor writes before controller execution;
- success completion records HTTP 200;
- controller failure records normalized HTTP/error outcome and rethrows the original error;
- PostgreSQL security-definer begin/complete functions persist the audit under restricted runtime DB role;
- manager can read organization audit;
- scoped host cannot read audit through service or direct RLS query;
- raw internal key material is not returned from the audit model;
- migration/typecheck/tests/build stay green.

## Operational use during key rotation

During Stage 7.2 Step 2, filter audit rows by service and fingerprint.

Once no recent trusted calls use the previous-key fingerprint, Core can safely remove
`VIEWS_INTERNAL_API_KEY_PREVIOUS`.

Do not retain previous keys solely for historical fingerprint lookup; the fingerprint remains after
the secret is removed.

## Next work

- rejected internal-auth attempt metrics without persisting attacker-controlled payloads;
- service-specific key separation instead of one shared key ring;
- asymmetric signed service identity / short-lived JWT;
- network ingress allowlists / mTLS when infrastructure supports it;
- audit retention and archival policy.
