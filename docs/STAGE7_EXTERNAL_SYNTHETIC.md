# Stage 7.15 — External Core Synthetic Check

## Goal

Detect failure of the entire staging origin host from outside that failure domain.

The internal tunnel replica SLO workflow runs on the staging host. If that host disappears, its self-hosted runner and its connector observer disappear with it. This external check therefore runs on a GitHub-hosted runner and reaches VIEWS only through the stable Cloudflare staging hostname.

## Enablement

The workflow is guarded.

Set:

VIEWS_EXTERNAL_SYNTHETIC_ENABLED=true

and configure:

VIEWS_STAGING_CORE_URL=https://<stable-staging-hostname>

as repository variables.

The job remains skipped until explicitly enabled.

The URL must be a clean HTTPS origin and must not be a temporary trycloudflare.com Quick Tunnel.

## Synthetic transaction

A successful observation requires consecutive successful samples of:

- GET /health -> HTTP 200
- GET /readiness -> HTTP 200
- POST /v1/guest-auth/exchange with an intentionally invalid fixture token -> HTTP 401

The 401 assertion proves the request crossed Cloudflare/Tunnel routing and reached the VIEWS authentication logic, rather than merely receiving a response from an edge placeholder.

Two consecutive successful samples are required by default to reduce transient false positives.

## Security

The external synthetic uses no:

- Tunnel token;
- database credential;
- signing private key;
- guest credential;
- production API key.

It operates only against the staging public hostname.

The invalid fixture guest token cannot authenticate and is expected to return 401.

## Evidence

The script writes validated JSON to:

/tmp/stage7.15-external-synthetic.json

The evidence includes only hostname, timestamp, attempt count, and HTTP status codes.

## Failure-domain coverage

The two observability controls complement each other:

- self-hosted tunnel replica SLO: detects connector degradation and loss of redundancy from inside the host;
- GitHub-hosted external synthetic: detects loss of the host or inability of Cloudflare to reach the origin from outside.

Neither control mutates infrastructure automatically.
