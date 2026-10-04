# VIEWS Integration Hub

## Booking.com
Use the official Booking.com Connectivity APIs after the VIEWS account is approved as a Connectivity Partner and a machine account is created.

Supported target capabilities in VIEWS:
- Reservations
- Rates & Availability
- Messaging
- Guest reviews
- Content

Authentication target: token-based machine-account flow. Credential values must live only in Cloudflare Secrets and must never be committed to GitHub or stored in D1.

## Airbnb
Airbnb software connectivity is partner-gated. VIEWS must obtain approved software/API partner access before a live connector can be enabled.

Supported target capabilities in VIEWS:
- Reservation sync
- Rates & availability
- Listing mapping/sync

Do not treat normal Airbnb host login/password as API credentials.

## AI Concierge
The AI concierge connector is intentionally vendor-neutral. It can be backed by OpenAI or another compatible provider through Cloudflare Secrets.

Capabilities:
- Guest chat
- Translation
- Service-request triage
- Knowledge assistance

Hard rule: the concierge never fabricates prices, booking state, payment success, refunds or property policies. Operational actions must create/route a Service Order or escalate to staff.

## Secret storage
Only secret references/status are exposed to the app. Secret values must live in Cloudflare encrypted secrets.
