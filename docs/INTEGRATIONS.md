# VIEWS Integration Hub

VIEWS supports three integration classes:

1. Booking.com Connectivity
   - reservations
   - rates & availability
   - messaging
   - guest reviews
   - content
   - requires approved Connectivity Partner access and machine-account token authentication

2. Airbnb Software Connection
   - reservation sync
   - rates & availability
   - listing mapping/sync
   - requires approved Airbnb software/API partner access
   - normal host login credentials are never treated as API credentials

3. AI Concierge
   - guest chat
   - translation
   - service-request triage
   - knowledge assistance
   - vendor-neutral adapter so the provider can be changed later

Security rule: integration credentials never belong in GitHub, D1 rows, browser storage or frontend bundles. VIEWS stores only connection metadata, health state, scopes, mappings and sync logs. Secret material belongs only in the deployment platform's encrypted secret store.

The AI Concierge must never fabricate rates, reservation state, payment success, refunds or property policy. Operational requests are escalated to staff or transformed into tracked Service Orders.
