# Stage 5.25 — OIDC authentication gate

## Implemented
- Service API now has two explicit authentication modes:
  - `VIEWS_AUTH_MODE=dev` (or omitted) requires `VIEWS_ALLOW_DEV_AUTH=1`, only for local private testing.
  - `VIEWS_AUTH_MODE=oidc` verifies signed access tokens via remote HTTPS JWKS with pinned issuer, audience, RS256/ES256 algorithms, expiry, issued-at, subject, tenant UUID and allowlisted role claims.
- Enabling dev authentication alongside OIDC mode is rejected at startup.
- In OIDC mode, the old manual-token HTML pages are not served. A real frontend login and token lifecycle must be implemented before external staging.
- No roles, organization ID or user ID are accepted from a browser request body.
- Crypto regression tests use ephemeral RSA keys to check issuer, audience, signature, expiry and roles.

## OIDC environment (provider-specific values required)
`VIEWS_AUTH_MODE=oidc`
`VIEWS_ALLOW_DEV_AUTH=0`
`VIEWS_OIDC_ISSUER=https://<trusted-issuer>/`
`VIEWS_OIDC_AUDIENCE=<dedicated-API-audience>`
`VIEWS_OIDC_JWKS_URL=https://<trusted-issuer>/.../jwks.json`

Provider must issue `organization_id` UUID and `views_roles` array as trusted access-token claims. For multi-organization access, use an approved organization selection/authorization process at the identity provider. Validate token revocation, account disabling, permission changes, browser login flow and audit events before public use.

## Not complete
- No provider has been configured or connected.
- No browser authorization-code + PKCE flow, session renewal, logout, or protected frontend has been implemented.
- No permanent HTTPS staging endpoint has been deployed.
- No production security review, rate limiting, secrets rotation or live payments.
- The current APK is still a debug WebView shell and requires an authorized HTTPS origin.

Do not publish the local Docker dev stack or manually entered test tokens to the public internet.
