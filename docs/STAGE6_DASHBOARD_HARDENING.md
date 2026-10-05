# Stage 6.7 — Dashboard Cache Security & Conditional HTTP

Status: implementation candidate.

## Purpose

Harden the Stage 6.6 dashboard read model against two edge cases:

1. a membership's property scope becomes narrower after an organization dashboard cache was generated;
2. source rows are removed while MAX(source_timestamp) remains unchanged.

This slice also adds private HTTP ETag / If-None-Match behavior.

## Migration

- `0024_analytics_dashboard_scope_hardening.sql`

Dashboard cache rows now persist:

- `property_ids uuid[]`

Existing cache rows are deleted during the migration because they do not contain a trustworthy
historical property set. Dashboard cache is derived/ephemeral, so invalidating it is safe.

## Scope-reduction security

The prior cache RLS was keyed by:

- organization;
- membership;
- optional property.

An organization-level row had `property_id=NULL`. If the same membership previously had broader
property access, direct SQL under that membership could still read the old cached payload after
its scopes were reduced.

Stage 6.7 fixes this at the database layer.

RLS now requires every cached property ID to still satisfy:

`app.can_access_property(property_id)`

A row containing any property outside the membership's current scope becomes invisible.

Property dashboards also require their `property_id` to be present in `property_ids`.

The application still includes the sorted property scope in the source fingerprint, so cache
isolation exists at both:

- cache-key/fingerprint layer;
- PostgreSQL RLS layer.

## Source fingerprint hardening

The dashboard source state now includes both timestamps and row counts:

- rollup refreshed timestamp + rollup row count;
- reservation projected timestamp + reservation fact count;
- economics projected timestamp + economics fact count.

This prevents a cache hit when a source row is deleted but the remaining rows still have the same
maximum timestamp.

Freshness response adds:

- `scopePropertyCount`
- `rollupRowCount`
- `reservationFactCount`
- `economicsFactCount`

## HTTP ETag

Dashboard summary returns:

- `ETag: "views-dashboard-v1-<sourceFingerprint>"`
- `Cache-Control: private, no-cache, must-revalidate`

The endpoint accepts:

- `If-None-Match`

Strong, weak, list and wildcard matching are supported.

When the client's ETag matches the current source fingerprint:

- HTTP status = 304;
- response body is omitted.

The request still checks actor authorization and current source state before returning 304.

## Why the response is private

Dashboard responses are membership-scoped and can depend on property assignments.

Shared/public proxy caching is therefore forbidden.

## Acceptance

CI seeds:

- one scoped host membership with access only to U-Tower;
- another same-organization property;
- a synthetic old organization-cache row for that host containing both properties.

Under the restricted runtime role, the scoped host must not be able to SELECT the old broad cache row.

After requesting a new dashboard, the host sees only a new cache entry whose `property_ids`
contains U-Tower.

A second regression fixture creates two rollup rows with the same refreshed timestamp. Deleting one
row leaves MAX(refreshed_at) unchanged but changes the row count. The source fingerprint must change
and the dashboard must be recomputed.

ETag unit tests verify:

- stable ETag generation;
- strong match;
- weak match;
- comma-separated list match;
- wildcard match;
- malformed fingerprint rejection.

## Next work

- report/export cache;
- scheduled dashboard/report delivery;
- wire Staff LiveDashboard to the production dashboard endpoint;
- comparison-period / variance API.
