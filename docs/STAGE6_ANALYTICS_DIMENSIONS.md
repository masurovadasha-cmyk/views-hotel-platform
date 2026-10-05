# Stage 6.2 — Booking Dimensions & Lifecycle Cohorts

Status: implementation candidate.

## Purpose

Extend the Stage 6 analytical fact layer without inventing attribution.

Canonical dimensions added to reservation facts:

- booking local date;
- source channel;
- guest segment;
- cancellation timestamp;
- no-show timestamp;
- cancellation lead time.

## Truthful attribution rule

`source_channel` and `guest_segment` are nullable.

The projector only persists a dimension when it is explicitly present in the frozen reservation
`quote_snapshot`.

Recognized snapshot fields:

- `sourceChannel` at snapshot root;
- `pricingSnapshot.sourceChannel`;
- `guestSegment` at snapshot root;
- `guestContext.guestSegment`.

Missing values stay `NULL`.

VIEWS must not silently replace missing attribution with labels such as `direct`, `leisure`,
`OTA`, `corporate` or `unknown`.

## Projection version

Stage 6.2 uses consumer:

- `analytics-core-v2`

The new consumer intentionally replays previously eligible outbox events so existing Stage 6 facts
are refreshed with the new dimension/lifecycle columns.

## Lifecycle provenance

Cancellation timestamp:

1. authoritative `reservations.cancelled_at`, when present;
2. otherwise the first booking-state event whose `to_status='cancelled'`.

No-show timestamp:

- first booking-state event whose `to_status='no_show'`.

If there is no authoritative event/timestamp, the analytical timestamp remains null.

Cancellation lead time is the non-negative interval between cancellation and local arrival.

## Arrival cohort view

`analytics_booking_cohorts_daily` is a `security_invoker` view.

Dimensions:

- organization;
- property;
- arrival date;
- currency;
- source channel;
- guest segment.

Metrics:

- booking count;
- active/stayed booking count;
- cancellation count;
- no-show count;
- cancellation rate;
- no-show rate;
- average lead time;
- average stay length;
- average cancellation lead time.

This view is separate from the stay-night KPI view so cancellations/no-shows do not corrupt
Occupancy, ADR or RevPAR.

## API

`GET /v1/analytics/properties/:propertyId/booking-cohorts?from=YYYY-MM-DD&to=YYYY-MM-DD`

Optional filters:

- `sourceChannel`
- `guestSegment`

Null/unattributed rows remain visible when no filter is supplied.

## Automated acceptance

The integration fixture creates one arrival cohort containing:

- one active direct/leisure reservation;
- one cancelled direct/leisure reservation;
- one no-show reservation with no source channel or guest segment.

Expected:

- direct/leisure booking count = 2;
- direct/leisure cancellation count = 1;
- direct/leisure cancellation rate = 0.5;
- unattributed booking count = 1;
- unattributed no-show count = 1;
- unattributed no-show rate = 1.0;
- missing attribution stays null.

## Next analytics slices

- explicit transactional source/channel capture contracts;
- organization/city rollups;
- marketplace commission and owner payout facts;
- booking-window cohorts;
- projection lag/health monitoring;
- materialized period rollups and cache layer.
