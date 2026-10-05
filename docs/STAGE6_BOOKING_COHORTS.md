# Stage 6.2 — Truthful Booking Cohorts

Status: replacement implementation on top of the current Stage 6 Worker/SLO stack.

## Why this slice exists

The earlier analytics dimensions layer introduced `booking_channel` and `market_segment`
with the placeholder value `unknown`.

That placeholder is not truthful attribution: it is impossible to distinguish a genuinely captured
dimension from a synthetic fallback.

Stage 6.2 removes that ambiguity.

## Migration

`0017_analytics_booking_cohorts.sql`

It:

- removes NOT NULL/default `unknown` from `booking_channel`;
- removes NOT NULL/default `unknown` from `market_segment`;
- converts existing synthetic `unknown` values to NULL;
- backfills explicit dimensions from frozen reservation snapshots;
- adds `booking_local_date`;
- backfills cancellation/no-show provenance;
- adds `cancellation_lead_days`;
- creates a canonical arrival-cohort view.

## Truthful dimension extraction

Accepted explicit snapshot fields include:

Booking channel:
- `bookingChannel`
- `sourceChannel`
- `pricingSnapshot.bookingChannel`
- `pricingSnapshot.sourceChannel`

Market segment:
- `marketSegment`
- `guestSegment`
- `guestContext.marketSegment`
- `guestContext.guestSegment`

Values are normalized to lowercase dimension codes.

If no explicit value exists, the fact remains NULL.

VIEWS does not silently assign:
- direct;
- ota;
- leisure;
- corporate;
- unknown.

## Worker/SLO compatibility

The analytics consumer remains:

- `analytics-core-v1`

This is intentional because the current staging stack already contains:

- projection health;
- tenant worker leases;
- projection SLO status.

Existing facts are corrected by migration backfill; new events use the updated projector.
No parallel analytics consumer is introduced.

## Lifecycle provenance

Cancellation timestamp:
1. `reservations.cancelled_at`;
2. otherwise first booking-state event whose `to_status='cancelled'`.

No-show timestamp:
- first booking-state event whose `to_status='no_show'`.

Cancellation lead time is the non-negative interval from cancellation to local arrival.

## Canonical arrival cohorts

View:

- `analytics_booking_cohorts_daily`

Dimensions:
- organization;
- property;
- arrival date;
- currency;
- booking channel;
- market segment.

Metrics:
- booking count;
- active/stayed count;
- cancellation count;
- no-show count;
- cancellation rate;
- no-show rate;
- average lead time;
- average stay length;
- average cancellation lead time.

This view is canonical for cancellation/no-show analysis.

The older stay-date dimension view remains available for operational daily slicing, but lifecycle
rates should be taken from the arrival-cohort view.

## API

`GET /v1/analytics/properties/:propertyId/booking-cohorts?from=YYYY-MM-DD&to=YYYY-MM-DD`

Optional filters:
- `bookingChannel`
- `marketSegment`

Filters are normalized with the same dimension-code rules as projection.

## Acceptance fixture

One arrival cohort contains:
- active Direct Web / Leisure reservation;
- cancelled Direct Web / Leisure reservation;
- no-show reservation without attribution.

Expected:
- Direct Web / Leisure bookings = 2;
- cancellations = 1;
- cancellation rate = 0.5;
- unattributed bookings = 1;
- unattributed no-shows = 1;
- no-show rate = 1.0;
- missing attribution remains NULL;
- no returned dimension equals synthetic `unknown`.

## Next analytics work

- transactional capture contracts for booking source/channel;
- marketplace commission and owner payout facts;
- organization/city rollups;
- materialized period rollups;
- dashboard aggregation/cache layer.
