# VIEWS local-only staging stack

This is an isolated development stack for tests on an authorized machine. It **must not** be exposed to the public internet. Its authentication is a development-only HMAC token and the UI has a manual token field.

Requirements: Docker Compose, private local machine, test data only.

1. Set `VIEWS_DB_ADMIN_PASSWORD`, `VIEWS_APP_DB_PASSWORD`, `VIEWS_AUTH_SECRET` (random 32+ characters), and `VIEWS_STAGING_DATABASE_URL` in a local, uncommitted `.env`. The database URL should use `views_staging_app` and the application password, with host `db` and database `views_staging`. URL-encode special characters in passwords.
2. From `deploy/staging`, run `docker compose up --build`.
3. Open `http://127.0.0.1:3200/health` on the same machine. Other routes: `/guest`, `/crm`, `/staff`, `/finance`.
4. Use test-only, short-lived signed tokens in this private environment. Do not use real guest information, payment cards or production credentials.
5. Shut down with `docker compose down`. To erase the test database: `docker compose down -v` (destructive).

**Not a public HTTPS deployment.** The Android WebView shell requires a private HTTPS server with production-grade authentication; it cannot use this localhost HTTP address directly.

Do not reuse this stack as production. It lacks OIDC, rate limits, backups, deployment hardening and external ingress.

Networking: PostgreSQL is attached only to the internal bridge. The API also joins a local edge bridge so the host's loopback mapping can reach it; the host port remains bound to `127.0.0.1` only. Never change the published host bind to `0.0.0.0` while using development tokens.
