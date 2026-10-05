# Stage 6.2 — Truthful Booking Cohorts

Status: implementation on top of the current Worker/SLO + Rollups stack.

## Purpose

Make booking-channel and market-segment analytics truthful and cohort-oriented.

The earlier dimensions layer used the synthetic fallback `unknown`. Stage 6.2 removes that
ambiguity: when attribution was not explicitly captured in the frozen reservation snapshot,
the analytical dimension remains NULL.

## Migration order

- 0015 — analytics dimensions + health
- 0016 — analytics worker leases + SLO
- 0017 — analytics daily rollups
- 0018 — truthful booking cohorts

No migration number is reused.

## Explicit attribution

Booking channel may be read only from explicit snapshot fields such as:

- `bookingChannel`
- `sourceChannel`
- `pricingSnapshot.bookingChannel`
- `pricingSnapshot.sourceChannel`

Market segment may be read only from:

- `marketSegment`
- `guestSegment`
- `guestContext.marketSegment`
- `guestContext.guestSegment`

Values are normalized to lowercase dimension codes. Missing values remain NULL.

## Lifecycle provenance

Cancellation:
- `reservations.cancelled_at` first;
- otherwise first booking-state event whose `to_status='cancelled'`.

No-show:
- first booking-state event whose `to_status='no_show'`.

Cancellation lead time is the non-negative interval between cancellation and local arrival.

## Canonical cohort view

`analytics_booking_cohorts_daily`

Dimensions:
- organization
- property
- arrival date
- currency
- booking channel
- market segment

Metrics:
- booking count
- active/stayed count
- cancellation count
- no-show count
- cancellation rate
- no-show rate
- average lead time
- average stay length
- average cancellation lead time

Cancellation/no-show rates belong to the arrival cohort view, not the stay-night KPI view.

## API

`GET /v1/analytics/properties/:propertyId/booking-cohorts?from=YYYY-MM-DD&to=YYYY-MM-DD`

Optional filters:
- `bookingChannel`
- `marketSegment`

Filters use the same normalization rules as projection.

## Compatibility

The consumer remains `analytics-core-v1`.

This preserves:
- Analytics Worker leases
- projection health
- SLO status
- rollup refresh
- dirty-range tracking

The projector still marks affected property/date ranges dirty after reservation changes.

## Acceptance

Integration coverage verifies:
- active + cancelled + no-show in one arrival cohort;
- explicit Direct Web / Leisure normalizes to `direct_web` / `leisure`;
- missing attribution remains NULL;
- cancellation rate = 0.5 for the attributed cohort;
- no-show rate = 1.0 for the unattributed cohort;
- synthetic `unknown` is not returned.
