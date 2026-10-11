# Stage 6.2 — Truthful Booking Cohorts

Status: implementation on top of Analytics Worker/SLO + Rollups.

## Objective

Make booking-source and market-segment analytics truthful while preserving the current
event-driven worker, projection health/SLO, and materialized daily rollups.

## Compatibility

This slice keeps:

- analytics consumer: `analytics-core-v1`;
- tenant worker leases;
- projection health/SLO;
- property daily rollups;
- organization daily rollups;
- dirty-range refresh behavior.

No parallel analytics consumer is introduced.

## Migration

`0018_analytics_booking_cohorts.sql`

It runs after:
- 0015 analytics dimensions/health;
- 0016 analytics worker/SLO;
- 0017 analytics rollups.

## Removing synthetic attribution

The prior dimensions layer used:

- `booking_channel='unknown'`
- `market_segment='unknown'`

Those defaults are removed.

Existing synthetic `unknown` values are converted to NULL.

New projections return NULL when the frozen reservation snapshot does not explicitly contain
a source/channel or market/guest segment.

## Recognized explicit fields

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

Values are normalized into lowercase dimension codes.

## Lifecycle facts

Reservation facts gain:

- `booking_local_date`
- `cancellation_lead_days`

Cancellation provenance:
1. reservation cancelled_at;
2. first booking-state event with to_status=cancelled.

No-show provenance:
- first booking-state event with to_status=no_show.

## Canonical arrival cohort view

`analytics_booking_cohorts_daily`

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
- average booking lead time;
- average stay length;
- average cancellation lead time.

Lifecycle rates must be read from this arrival cohort view rather than inferred from stay-night rollups.

## API

`GET /v1/analytics/properties/:propertyId/booking-cohorts?from=YYYY-MM-DD&to=YYYY-MM-DD`

Optional:
- `bookingChannel`
- `marketSegment`

The API uses the same normalization rules as projection.

## Rollup interaction

Reservation projection still marks `analytics_rollup_dirty_ranges`.

The existing worker continues to:

1. consume outbox events;
2. refresh reservation/payment facts;
3. mark dirty property date ranges;
4. refresh daily rollups;
5. update worker lease/SLO state.

The new cohort view reads canonical reservation facts and does not fork the worker pipeline.

## Acceptance

The integration fixture includes one arrival date with:

- active Direct Web / Leisure booking;
- cancelled Direct Web / Leisure booking;
- unattributed no-show.

Expected:
- attributed bookings = 2;
- cancellation count = 1;
- cancellation rate = 0.5;
- unattributed bookings = 1;
- no-show count = 1;
- no-show rate = 1.0;
- missing dimensions remain NULL;
- no response reintroduces synthetic `unknown`.
