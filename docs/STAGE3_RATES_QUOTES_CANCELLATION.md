# Stage 3 — Rates, Quote & Cancellation Engine

Status: implemented and verified in VIEWS Production Core.

## Scope delivered

- Base nightly price from rate plan
- Daily price overrides
- Weekday pricing / weekend pricing
- Minimum stay
- Closed dates
- Closed to arrival / closed to departure
- Length-of-stay discounts
- Early-booking discounts
- Last-minute discounts
- Configurable taxes and fees
- Per-booking charges
- Per-guest-per-night charges
- Residency and minimum-age conditions
- Immutable booking quotes
- Frozen cancellation-policy snapshot
- Cancellation refund preview
- Quote -> Hold handoff without trusting client prices

## Critical security rule

The browser never submits authoritative money values to create a booking hold.

Production flow:

1. POST /v1/quotes
2. Server calculates price from PostgreSQL rate/tax configuration.
3. Server stores immutable booking_quotes + booking_quote_lines.
4. POST /v1/bookings/holds with quoteId + Idempotency-Key.
5. BookingHoldService reloads the quote from PostgreSQL.
6. Quote price lines and cancellation policy are frozen onto the reservation.

Any amount displayed by a client is informational only.

## Money

All production amounts use bigint minor units plus ISO-4217 currency.

Examples:
- UZS 910,000 -> 91,000,000 minor units when provider/accounting configuration uses 1/100 units.
- The exact provider minor-unit convention must be confirmed per payment adapter before launch.

Never use float/double for booking totals.

## Migration

apps/api/db/migrations/0007_rates_quotes_cancellation.sql

New tables:
- rate_day_overrides
- rate_weekday_rules
- rate_adjustments
- charge_rules
- cancellation_policy_templates
- booking_quotes
- booking_quote_lines

Reservation price lines now also persist:
- code
- refundable
- metadata

## Quote immutability

booking_quotes and booking_quote_lines have PostgreSQL triggers that reject UPDATE and DELETE.

A changed price requires a new quote.

Default quote TTL: 600 seconds.
Default booking hold TTL: 900 seconds.

These values are technical defaults and must be reviewed per payment provider.

## Cancellation policy

The quote snapshots:
- rules
- property timezone
- non-refundable line codes

The reservation copies that snapshot when the hold is created.

Refund calculation uses exact hours between cancellation request and check-in instant.
Changing the current rate-plan policy does not change an existing booking.

## Configurable tax/fee model

Supported rule kinds:
- percent_of_accommodation
- fixed_per_booking
- fixed_per_guest_night

Rule filters:
- organization
- property
- country
- region
- residency
- minimum guest age
- effective-from / effective-to

No Uzbekistan tax/tourist-fee production rates are hard-coded.

## Uzbekistan — CHECK MANUALLY

Before production launch, confirm with lawyer/accountant:
- tourist fee rates by region and accommodation type
- exact age threshold semantics
- resident vs non-resident rules
- BCU/BRV-linked calculation rules and effective dates
- VAT applicability and taxable base for each product/service
- whether displayed consumer price must always include each tax/fee
- fiscal receipt treatment for accommodation vs ancillary services

Only after confirmation should charge_rules be populated with production values.

## API

POST /v1/quotes

Input:
- propertyId
- unitId
- ratePlanId
- checkInAt
- checkOutAt
- guests: age + residency

Output:
- quoteId
- currency
- nights
- accommodationMinor
- discountMinor
- chargesMinor
- totalMinor
- lines
- cancellationPolicy
- expiresAt

POST /v1/bookings/holds

Input:
- quoteId
- optional ttlSeconds

Header:
- Idempotency-Key

Client-provided totals and tax lines are not accepted.

POST /v1/bookings/:id/cancellation-preview

Returns the refund calculation from the reservation's frozen policy.
It does NOT execute payment refund or cancel a paid reservation. That belongs to Stage 4 Payments & Ledger.

## Local launch

1. docker compose -f docker-compose.production-dev.yml up -d
2. Apply PostgreSQL extensions.
3. Apply production migrations 0001 through 0007 in order.
4. Create restricted views_app DB role per ADR 0002.
5. cd apps/api
6. npm install
7. DATABASE_URL=postgresql://views_app:<password>@localhost:5432/views npm test
8. npm run typecheck
9. npm run build
10. npm run start:dev

## Automated verification

VIEWS Production Core verifies:
- PostgreSQL 16 migration chain
- no-overbooking exclusion constraint
- tenant and property RLS
- pricing unit tests
- min-stay / CTA restrictions
- weekday/day override precedence
- last-minute discounts
- configurable taxes / guest-night charges
- DST-safe local-night calculation
- cancellation refund tiers
- immutable quote trigger
- server quote -> hold
- hold concurrency
- idempotency
- frozen price/cancellation snapshots
- confirm / release / expiry
- NestJS typecheck
- NestJS production build

## Risks / manual checks

- CHECK: production auth must derive tenant context server-side; browser tenant headers are still a development bridge.
- CHECK: quote and hold TTL by payment provider.
- CHECK: late payment success after expired hold.
- CHECK: country-specific tax and fiscal rules.
- CHECK: FX/display-currency architecture before USD/EUR checkout.
- CHECK: cancellation edge cases after partial service consumption or partial refunds.
- CHECK: marketplace host-specific rate overrides and commission interaction, implemented in later marketplace/payment stages.
