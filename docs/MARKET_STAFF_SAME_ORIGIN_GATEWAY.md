# Staff CRM same-origin gateway (Stage 7)

This Pages Function implements the browser adapter's previously missing GET route:
`/api/staff/market/properties/:propertyId/orders/:orderId`.

## Trust boundary
- Resolves the existing `views_session` server-side; guest sessions and unauthorized staff roles fail closed.
- Checks the local property scope before resolving active Core identity/property links in D1.
- Uses the configured Core origin only (no caller-supplied URL), fixed internal path and a request-bound 30-second Ed25519 signed service token generated server-side.
- Sends Core actor IDs and token only in the server-to-server request. No secret is returned to the browser.
- Fails closed if signing configuration or Core mappings are absent. Does not enable a fallback legacy key.
- Maps unauthorized/not-found/unavailable errors without leaking upstream details. Does not cache responses.

## Activation gates
Requires deployed D1 identity/property mappings, staff session cookies, Core URL, signing key/kid, trusted ingress configuration and matching Core public key. Verify Core network restrictions, 401/403, revocation, role scope, origin isolation, response schema and browser E2E in staging. The existing client adapter remains disabled until explicitly wired. No guest checkout, payment, staff mutation, APK or production release is performed.
