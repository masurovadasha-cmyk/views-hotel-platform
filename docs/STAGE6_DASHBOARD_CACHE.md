# Stage 6.6 — Scope-Safe Dashboard Summary Cache

Status: implementation candidate.

## Goal

Provide one production API boundary for dashboard reads without making the UI recompute canonical
hospitality, lifecycle, or marketplace metrics.

The dashboard layer reads only analytics projections/materialized rollups. It does not scan
transactional reservations for ordinary dashboard requests.

## Endpoints

Organization portfolio:

`GET /v1/analytics/dashboard/organization?from=YYYY-MM-DD&to=YYYY-MM-DD`

Property:

`GET /v1/analytics/dashboard/properties/:propertyId?from=YYYY-MM-DD&to=YYYY-MM-DD`

Maximum range:

- 366 calendar days.

Allowed roles:

- host;
- owner;
- manager;
- accountant.

Property access is still enforced through `app.can_access_property`.

## Currency boundary

Monetary metrics are returned as separate currency buckets.

The dashboard never sums UZS + USD or any other different currencies into one amount.

Each currency bucket contains:

### Hospitality
- available unit nights;
- occupied unit nights;
- accommodation revenue;
- gross revenue;
- net revenue;
- Occupancy;
- ADR;
- RevPAR.

Source:

- `analytics_property_daily_rollups`.

### Lifecycle
- booking count;
- active/stayed count;
- cancellation count/rate;
- no-show count/rate;
- average lead time;
- average stay;
- average cancellation lead time.

Source:

- `analytics_booking_cohorts_daily`.

### Marketplace economics
- finalized economics present flag;
- net collected;
- platform commission;
- owner payable;
- taxes withheld;
- other deductions;
- platform commission rate;
- owner payable rate.

Source:

- `analytics_marketplace_stay_daily`.

If no finalized marketplace economics exists, marketplace amounts stay zero and
`finalizedEconomicsPresent=false`.

## Cache

Migration:

- `0023_analytics_dashboard_cache.sql`.

Cache key dimensions:

- organization;
- scope key;
- property-scope SHA-256;
- from date;
- to date.

TTL:

- 60 seconds.

A TTL hit is accepted only when the source signature is unchanged.

## Source-signature invalidation

The source signature hashes filtered source state:

- materialized rollup max refreshed timestamp + row count;
- reservation fact max projected timestamp + count;
- marketplace economics max projected timestamp + count.

When a materialized/projection source changes, the signature changes and the cache is refreshed
immediately even when the previous entry has not expired.

The API also returns an opaque ETag-like SHA-256 value derived from:

- organization;
- scope;
- scope hash;
- date range;
- source signature.

## Scope-safe cache isolation

A cache entry stores the exact UUID list of properties visible to the actor when it was generated.

PostgreSQL RLS permits reading a cache row only when every cached property still passes:

`app.can_access_property(property_id)`.

This prevents a scoped host from reading/reusing a manager cache that contains more properties.

The application cache key also contains a SHA-256 hash of the sorted accessible property IDs.

This is defense in depth:

- application key separation;
- PostgreSQL RLS separation.

## Cache cleanup

Bounded cleanup function:

`app.prune_analytics_dashboard_cache(limit, now)`

Expired entries can be removed by the general production scheduler without unbounded deletes.

## Freshness response

The dashboard response exposes source freshness metadata:

- rollupRefreshedAt;
- rollupRows;
- reservationProjectedAt;
- reservationFacts;
- economicsProjectedAt;
- economicsFacts;
- sourceSignature;
- etag.

It also exposes cache metadata:

- hit;
- generatedAt;
- expiresAt;
- ttlSeconds.

This lets the UI show data freshness without inventing a “live” status.

## Automated acceptance

The integration fixture creates:

- U-Tower rollup data;
- a second property rollup;
- UZS and USD data;
- manager access to the portfolio;
- a host scoped only to U-Tower.

It proves:

- currencies stay separate;
- weighted portfolio Occupancy/ADR/RevPAR are recomputed from numerators/denominators;
- unchanged source returns a cache hit;
- source refresh changes the signature and forces a cache miss;
- property dashboard contains only that property;
- scoped host sees only U-Tower metrics;
- host cannot read the manager’s broader cache row even with direct SQL.

## Next work

- HTTP conditional GET using the dashboard ETag;
- scheduled cache pruning;
- dashboard comparison period / variance;
- export/report cache;
- connect Staff LiveDashboard to this production API instead of local/demo calculations.
