# Stage 7.4 — Internal Authentication Rejection Telemetry

Status: implementation candidate.

## Goal

Measure rejected trusted-service authentication attempts without persisting raw keys, raw IP
addresses, actor header values, request bodies, query strings, or attacker-controlled free-form
payloads.

Stage 7.3 audits authenticated trusted-service requests.
Stage 7.4 covers requests that fail before becoming trusted.

## Rejection reasons

Only fixed reason codes are stored:

- partial_actor_context
- missing_internal_key
- invalid_internal_key
- missing_service_identity
- invalid_service_identity

No exception text or attacker-supplied header value is stored as a reason.

## Network privacy

The raw client IP is never persisted.

The system reuses the existing security HMAC boundary:

HMAC-SHA256(GUEST_AUTH_RATE_LIMIT_SECRET, client_ip)

The stored value is a 64-character pseudonymous network hash.

If a valid client IP cannot be resolved under the configured trusted-proxy mode, the request is
placed into one deterministic HMAC bucket derived from:

network-unavailable

The raw string is never written to the table.

## Trusted proxy behavior

- direct mode: socket remote address
- cloudflare mode: CF-Connecting-IP

The service does not trust arbitrary X-Forwarded-For values.

## Database

Migration:

- 0029_internal_auth_rejection_metrics.sql

Table:

- internal_auth_rejection_counters

The table is aggregated by:

- UTC hour bucket
- rejection reason
- HMAC network hash
- stable controller/handler endpoint

Each row stores:

- rejection count
- first seen
- last seen

This avoids creating one durable row per hostile request.

## Endpoint identity

The metric uses the Nest controller/handler identity, for example:

- AnalyticsDashboardController.summary
- AnalyticsInternalJobsController.reportCycle

The raw URL and query string are not persisted.

## Where counting occurs

### Actor-header requests

InternalActorAuthGuard records failures for:

- partial actor triplet
- missing internal key
- invalid/duplicated internal key
- missing service identity
- invalid service identity

The guard rejects the request after attempting the metric write.

A telemetry write failure never turns an authentication rejection into an allowed request.

### System internal requests

InternalServiceAuditInterceptor handles requests that carry an internal key but no actor triplet.

If internal key/service identity verification fails, it records the corresponding rejection before
returning Unauthorized.

Authenticated requests are not counted as rejections; they continue into the Stage 7.3 durable
trusted-service audit.

## Double-count prevention

Actor-header requests fail in the guard before the interceptor.

System internal requests have no actor triplet and therefore pass the actor guard; the interceptor is
their authentication/rejection boundary.

This prevents one failed request from incrementing both paths.

## Read API

GET /v1/security/internal-auth-rejections?hours=24&limit=100

Read role:

- platform_admin only

Returned network identity is shortened to a 16-character display fingerprint.

The full HMAC remains database-internal.

Tenant managers/hosts/front desk cannot read the platform-wide rejection table.

## RLS

The table uses FORCE ROW LEVEL SECURITY.

SELECT is permitted only when:

app.current_membership_role() = 'platform_admin'

Ordinary tenant users see zero rows even if they attempt direct SQL through the restricted runtime
role.

## Retention

Bounded pruning function:

app.prune_internal_auth_rejections(before_timestamp, limit)

The function supports deleting old aggregate buckets in bounded batches.

A later platform maintenance scheduler may call this function. Stage 7.4 does not claim an external
retention scheduler is already connected.

Recommended initial retention:

- 30 to 90 days for online operational review
- longer retention only through an explicit security archive policy

## Automated acceptance

Tests verify:

- actor guard records missing-key rejection before 401
- actor guard records partial actor context separately
- system internal call with valid key but missing service ID records rejection
- repeated identical rejections aggregate from count 1 to count 2
- raw IP is never returned from the service model
- no-IP requests use the deterministic unavailable bucket
- manager role cannot read the platform rejection table
- direct manager SQL sees zero rows because of RLS
- migration/typecheck/API tests/build remain green

## Next work

- platform-admin UI for trusted-service/audit security events
- alert thresholds for sustained invalid-key spikes
- service-specific key binding instead of a shared accepted-key ring
- signed service identity / short-lived JWT
- network ingress allowlists / mTLS
