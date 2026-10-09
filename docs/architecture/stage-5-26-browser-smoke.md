# VIEWS Stage 5.26 — Chromium UI smoke tests

The new `browser-smoke` CI job opens four real Chromium pages at a 390×844 mobile viewport, served by a local, test-only static HTTP server. It mocks the API and exercises the DOM and user interactions:

- Guest: load bookings and catalog, add to cart, create a test order, display the server-returned total.
- CRM: load orders and SLA counts, open order details.
- Staff: display an assigned task and its action.
- Finance: load a read-only payment row and empty refund state.

The test captures JavaScript page errors and fails if any occur. Mock data contains no real guest or payment information.

**Important:** This is browser-level UI smoke testing, not a complete end-to-end system test. PostgreSQL, authorization and inventory are verified in separate integration jobs. It does not prove pixel-perfect Canva parity, real OIDC login, Android hardware compatibility, provider payments or public HTTPS deployment.

Release requirements still open: production identity provider and PKCE login, staging HTTPS ingress, accessible design review, responsive testing on multiple devices, approved catalog data, payment sandbox verification and user acceptance tests. The APK remains a debug WebView launcher.
