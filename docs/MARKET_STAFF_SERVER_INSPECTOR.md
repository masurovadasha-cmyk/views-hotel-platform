# Stage 7 — opt-in Staff CRM server order inspector

Adds a read-only Core order inspector to the existing V-Market Staff screen, using the already-tested same-origin browser adapter. It is gated by `VITE_VIEWS_STAFF_GATEWAY=true` at build time and remains absent from the public static review build by default.

The user must supply a local property ID (for example `utower`) and the UUID of an existing server order. The browser calls only `/api/staff/market/properties/:propertyId/orders/:orderId` with its same-origin session cookie; no internal Core credentials are embedded. The Pages BFF must validate the staff session and resolve property and identity mappings before signing its upstream request.

The inspector never writes to server orders, never alters the local demo stock or orders, and never triggers real payment. It handles 400/401/403/404/503 and network errors, cancels stale requests, and shows items, payment state, SLA and event history.

Before enabling in staging: deploy and verify the BFF and Core service signing configuration, identity links, staff role/property scope, response validator, and browser end-to-end tests. Do not enable the feature flag on the GitHub Pages static demo because it has no Pages Functions backend. This is a read-only integration slice, not a live guest checkout.
