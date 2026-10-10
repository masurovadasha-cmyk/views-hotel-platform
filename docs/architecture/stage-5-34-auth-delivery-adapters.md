# Stage 5.34 — External notification sandbox and OIDC PKCE preparation

## Checked
The preceding Stage 5.33 branch head `796558c` passed seven GitHub Actions jobs, including Node.js, PostgreSQL, Chromium, local staging and Android debug assembly. The tested web and APK archives belong to that precise commit.

## New bounded interfaces
- `external-notification-contract.mjs` validates channel, template, consent reference, opaque recipient reference and idempotency key.
- A deterministic sandbox transport can simulate accepted notifications, with no real SMS, email, push, network send, recipient address or third-party API credentials.
- The sandbox explicitly rejects raw email addresses, phone numbers, device tokens and message text as fields of the command. This is a contract test, not legal verification of actual consent.
- `oidc-pkce.mjs` creates high-entropy PKCE verifiers and S256 challenges and validates the basic HTTPS requirements for OAuth browser configuration.

## Not yet implemented
- Real recipient/contact consent storage and revocation checks, provider adapters, provider webhooks, suppression lists, provider retries, signed callbacks or delivery evidence.
- Browser redirect login, authorization code exchange, state and nonce session binding, logout, token refresh, secure storage, provider configuration or deployment. The PKCE module does not enable login on its own.
- Permanent private HTTPS staging, public deployment, full Android app, payments, or real-world delivery tests.

## Release order
1. Keep external delivery disabled until consent, templates, send budgets and provider sandbox are configured.
2. Select a trusted identity provider and register redirect URIs/client audience. Add authorization-code + PKCE with state/nonce validation, and backend-issued secure session cookies or in-memory access tokens appropriate to the target platform.
3. Validate tenant roles at the API on every request; never trust role or organization IDs from browser input.
4. Run browser and Android acceptance tests before shipping. Do not publicly expose the development manual token screen.
