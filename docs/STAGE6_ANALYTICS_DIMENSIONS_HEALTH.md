# Stage 6.2 — Analytics Dimensions & Projection Health

## Scope

Extends Data & Analytics Layer 0.6 with:
- booking channel dimension;
- market segment dimension;
- cancellation metrics;
- no-show metrics;
- projection lag/health.

## Truthful dimension policy

The transactional core does not yet have a dedicated canonical channel/segment registry.

Therefore analytics reads:
- `quote_snapshot.bookingChannel`
- `quote_snapshot.marketSegment`

Values are normalized to safe dimension codes. Missing or invalid source values become `unknown`.

VIEWS does not infer Airbnb, Booking.com, direct, corporate or other channels without source data.

## Reservation facts

`analytics_reservation_facts` now includes:
- booking_channel
- market_segment
- cancelled_at
- no_show_at

Cancellation time comes from `reservations.cancelled_at`.

No-show time comes from the authoritative `booking_state_events` transition to `no_show`.

## Dimension KPI view

`analytics_property_daily_dimensions` is a `security_invoker` view.

Dimensions:
- organization
- property
- date
- currency
- booking channel
- market segment

Metrics:
- booking count
- active booking count
- cancelled booking count
- no-show booking count
- cancellation rate
- no-show rate
- average lead time
- average stay length

## Projection health

`analytics_projection_health` reports per organization:
- pending relevant outbox events
- oldest pending timestamp
- last processed timestamp
- oldest pending age in seconds

Relevant events currently include:
- reservation aggregate events
- finance.payment_intent.v1

This is the basis for worker lag alerts and SLOs.

## API

Dimension metrics:

`GET /v1/analytics/properties/:propertyId/dimensions?from=YYYY-MM-DD&to=YYYY-MM-DD`

Projection health:

`GET /v1/analytics/health`

## Acceptance

Integration tests cover:
- confirmed booking with direct/leisure dimensions;
- cancelled OTA/leisure booking;
- no-show corporate_portal/business booking;
- cancellation rate;
- no-show rate;
- intentionally pending relevant outbox event;
- projection lag age.

## Next slice

Stage 6.3:
- scheduled/background projection runner;
- projection lag thresholds and alerts;
- channel source registry / adapter mapping;
- city / country / portfolio rollups;
- materialized rollups and cache strategy for large portfolios.
