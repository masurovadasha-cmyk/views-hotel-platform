# Stage 6.5 — Scope-Safe Portfolio Rollups

Status: implementation candidate.

## Goal

Scale VIEWS analytics from a single property to multi-city / multi-country portfolios while preserving:

- materialized property-rollup performance;
- weighted hospitality KPI math;
- tenant isolation;
- membership property scope.

This layer is designed for portfolios such as:

- Tashkent;
- Samarkand;
- Bukhara;
- Khiva;
- later additional countries.

## Source

Portfolio rollups aggregate only:

- `analytics_property_daily_rollups`

They do not rescan reservations/payments.

This keeps city/country reads on top of the incremental materialization already refreshed by the analytics worker.

## Migration

- `0022_analytics_portfolio_rollups.sql`

## Scope security fix

The prior `analytics_organization_daily_rollups` view aggregated every property in the organization.

Stage 6.5 replaces it with a `security_invoker` view that includes:

`WHERE app.can_access_property(property_id)`

Result:

- owner / manager: entire organization portfolio;
- scoped memberships: only assigned properties;
- tenant RLS still applies;
- front desk remains forbidden by the analytics API role gate.

The same property-scope filter is used by city and country portfolio views.

## City rollups

View:

- `analytics_city_daily_rollups`

Dimensions:

- organization;
- country code;
- region code;
- city;
- local date;
- currency.

Metrics:

- property count;
- available unit nights;
- occupied unit nights;
- booking count;
- accommodation revenue;
- gross revenue;
- net revenue;
- occupancy;
- ADR;
- RevPAR;
- weighted average lead time;
- weighted average stay length;
- freshness timestamp.

## Country rollups

View:

- `analytics_country_daily_rollups`

Dimensions:

- organization;
- country code;
- local date;
- currency.

Metrics match city rollups.

## KPI math

Occupancy, ADR and RevPAR are not averaged from property percentages.

They are recomputed from summed numerators and denominators.

Example:

- property A: 5 occupied / 10 available, accommodation 5,000;
- property B: 10 occupied / 20 available, accommodation 15,000.

Country result:

- occupied = 15;
- available = 30;
- occupancy = 0.5;
- accommodation = 20,000;
- ADR = 20,000 / 15 = 1,333.33;
- RevPAR = 20,000 / 30 = 666.67.

Lead time and stay length are weighted by booking count.

## API

City portfolio:

`GET /v1/analytics/portfolio/cities/daily?from=YYYY-MM-DD&to=YYYY-MM-DD`

Optional filters:

- `countryCode`
- `city`

Country portfolio:

`GET /v1/analytics/portfolio/countries/daily?from=YYYY-MM-DD&to=YYYY-MM-DD`

Optional:

- `countryCode`

Country codes are normalized to uppercase ISO-style two-letter codes.
City filtering is case-insensitive but returns the stored canonical city string.

## Authorization

API read roles remain:

- host;
- owner;
- manager;
- accountant.

Property scope is enforced inside portfolio views through `app.can_access_property`.

Other roles such as front desk remain rejected by the API.

## Automated acceptance

The integration fixture creates materialized rollups for:

- Tashkent property;
- Samarkand property.

Manager expectations:

- sees both city rows;
- country property count = 2;
- weighted Occupancy/ADR/RevPAR are mathematically correct;
- weighted average lead time/stay are correct.

Defense-in-depth scope expectation:

- existing scoped front-desk membership sees only its Tashkent property when querying the SQL security-invoker view directly;
- it cannot call the analytics query API because its role is not allowed.

## Next work

- region-level rollups where region codes are standardized;
- channel/segment materialized portfolio rollups;
- dashboard summary endpoint/caching;
- rollup freshness SLO exposed per geography;
- export/report cache.
