# Stage 6.4 — Transactional Booking Attribution

Status: implementation candidate.

## Goal

Make analytics dimensions originate from the booking transaction itself.

Stage 6.2 made booking-channel and market-segment analytics truthful after the marketplace economics slice by preserving missing
attribution as NULL. Stage 6.3 closes the remaining provenance gap: new quotes can now record
explicit attribution that is frozen into the reservation snapshot and then projected to analytics.

## Database

Migration:

- `0021_booking_attribution.sql`

`booking_quotes` gains nullable:

- `booking_channel`
- `market_segment`
- `attribution_source`
- `attribution_actor_user_id`
- `attribution_actor_membership_id`

There are no defaults such as `unknown`, `direct`, or `leisure`.

Existing quotes remain unattributed unless they already carry truthful snapshot information.

## Booking channel contract

Allowed canonical channels:

- `staff_crm`
- `guest_app`
- `host_portal`
- `marketplace_api`
- `import`

The current staff quote endpoint always assigns:

- channel = `staff_crm`
- source = `staff_actor`

The request body cannot override the channel.

Future guest/host/integration endpoints must assign their own trusted channel server-side rather
than accepting an arbitrary public channel value.

## Market segment contract

Market segment is optional.

The current staff quote endpoint accepts staff classification metadata through:

- `x-market-segment`

The value is normalized into a 1-64 character lowercase code.

Example:

- `Corporate Sales` -> `corporate_sales`

Blank input remains NULL.

The system does not infer market segment from guest identity, rate, price, nationality or channel.

## Attribution provenance

When attribution is supplied, the quote stores the authenticated actor user and membership IDs.

This records who asserted the attribution without placing PII into the analytics fact.

## Immutable reservation snapshot

When a quote becomes a booking hold, the reservation `quote_snapshot` freezes:

- quote ID;
- pricing snapshot;
- guest context;
- booking channel;
- market segment;
- attribution source.

Analytics continues to read the frozen reservation snapshot rather than mutable request metadata.

## Analytics path

Canonical flow:

`staff quote -> booking_quotes -> reservation.quote_snapshot -> outbox -> analytics_reservation_facts`

The existing `analytics-core-v1` worker, health/SLO, rollups and booking cohorts remain unchanged.

## Acceptance

The integration fixture creates a staff CRM quote with:

- market segment = `Corporate Sales`

Expected:

- quote booking channel = `staff_crm`;
- quote market segment = `corporate_sales`;
- attribution source = `staff_actor`;
- actor user/membership provenance stored;
- reservation snapshot freezes the same dimensions;
- analytics fact projects `staff_crm / corporate_sales`.

## Next work

- public Guest App quote endpoint assigns `guest_app` server-side;
- Host Portal quote endpoint assigns `host_portal`;
- trusted channel-manager/import adapters assign `marketplace_api` or `import`;
- managed market-segment catalog and permissions;
- marketplace commission / owner-payout economics.
