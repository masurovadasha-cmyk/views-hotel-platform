# Stage 6.4 — Incremental Analytics Rollups

## Goal

Scale dashboard reads for large portfolios without recalculating the full analytical view on every request.

## Dirty ranges

`analytics_rollup_dirty_ranges` stores one pending date range per organization + property.

Whenever a reservation projection changes:
- its property is marked dirty;
- the dirty range expands with LEAST/GREATEST;
- the range covers local stay dates only.

This coalesces many reservation changes into one property refresh.

## Property rollups

`analytics_property_daily_rollups` materializes daily property KPIs:
- available unit nights
- occupied unit nights
- booking count
- accommodation revenue
- gross revenue
- net revenue
- occupancy
- ADR
- RevPAR
- average lead time
- average stay length
- refreshed timestamp

Currency is never null. Empty-booking dates use the organization default currency.

## Transactional refresh

`AnalyticsRollupService.refreshOrganization(...)`:
1. locks dirty property ranges with `FOR UPDATE SKIP LOCKED`;
2. removes old rollup rows only for the dirty date range;
3. rebuilds the range from the canonical analytics daily view;
4. removes the exact dirty marker only after refresh succeeds.

If another reservation update arrives while the marker is locked, its update waits and then recreates/extends the dirty range after the refresh transaction commits. No update is intentionally lost.

## Worker integration

The Stage 6 lease-safe analytics worker now performs:
1. event projection;
2. dirty property rollup refresh;
3. tenant lease completion.

One scheduler path therefore owns both projection and materialization.

## Organization rollups

`analytics_organization_daily_rollups` aggregates property rollups by:
- organization
- date
- currency

Occupancy, ADR and RevPAR are recomputed from summed numerators/denominators, not averaged across properties.

## API

Property materialized KPI:

`GET /v1/analytics/properties/:propertyId/rollups/daily?from=YYYY-MM-DD&to=YYYY-MM-DD`

Organization materialized KPI:

`GET /v1/analytics/organization/rollups/daily?from=YYYY-MM-DD&to=YYYY-MM-DD`

These endpoints read rollup tables/views rather than the heavier live analytical view.

## Acceptance

Integration coverage verifies:
- projection marks a property dirty;
- worker refreshes the dirty range;
- materialized rows exist for every stay date;
- exact nightly revenue allocation is retained;
- property rollup API returns materialized KPI;
- organization rollup equals the single-property source in the fixture;
- weighted Occupancy/ADR/RevPAR remain correct.

## Next

- city/country portfolio rollups;
- channel/segment materialized rollups;
- rollup freshness SLO;
- export/report cache;
- production scheduler binding.
