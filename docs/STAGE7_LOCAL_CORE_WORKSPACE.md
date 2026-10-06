# Stage 7.24 — first local browser → Core → PostgreSQL booking journey

## Scope

This connects one working booking workspace inside the existing VIEWS React
application to the already-running Windows-local PostgreSQL Core. It does NOT
claim that every Guest App or Staff CRM screen now uses PostgreSQL, and does not
activate a real login system, a payment provider, a public endpoint, an Android
release, a permanent cloud host or the Stage 7.22 scheduler.

Open `http://127.0.0.1:4173/?api=local-core` on the authorized computer.
`?api=demo` still opens the prior visual demonstration. The dedicated mode is
recognized only on loopback HTTP port 4173. No new repository or booking engine
is created; quote, hold and release reuse the existing Core services.

## Data and actor

`prepare-local-workspace.cjs --ack=LOCAL_SYNTHETIC_WORKSPACE` explicitly seeds a
separate synthetic organization, a front_desk membership scoped to ONE property,
two test studios, and a test UZS rate/cancellation policy. It is idempotent and
does not reset the prior financial/expiry fixtures or other records. The values
are test inputs, NOT current operating inventory, prices, taxes or owner data.

The seeding command alone reads the existing local owner secret. The gateway
never connects to PostgreSQL. It reads only the server-side fixture mapping and
local service key from the restricted private directory outside Git. Browser
callers cannot choose organization, user, membership, property, price or TTL.

The new `GET /v1/booking-workspace?propertyId=...` is a bounded read projection
using `DatabaseService.withActor`, active membership, `reservation.read` and
`app.can_access_property`. Global service/ingress guards are unchanged. It exposes
no guest/passport/payment credentials. It returns up to 200 unit/rate choices
and 50 recent reservations with explicit truncation flags. The local fixture
has only two units and one rate.

## Browser gateway

The existing loopback review server now has four fixed gateway operations plus
a local fixture session bootstrap:

- GET /local-api/session — explicitly labelled synthetic-front-desk session.
- GET /local-api/workspace — the bounded Core read projection.
- POST /local-api/quotes — fixed scoped property/unit/rate and validated dates.
- POST /local-api/holds — only a quote issued to this session; 900-second TTL.
- POST /local-api/release — only a reservation returned in this workspace.

The runtime has a local-workspace service key and an exact 127.0.0.1/32 source
allowlist in its TEST configuration. Those credentials are injected server-side;
actor headers supplied by the browser are rejected. Production modes and Linux
container defaults are not relaxed. There is no arbitrary proxy path, URL, host,
method or header forwarding. The original /api/* UI contract is not falsely
forwarded to unrelated Core routes; it remains unavailable on this local host.

This is a local development identity, NOT authentication for real staff. Any
process controlled by the same Windows user is in the local trust boundary.
Do not publish or tunnel this fixture gateway, import real guests, or copy its
session scheme into production. General user auth and production BFF integration
remain separate work.

Browser protections include exact Host/Origin checks, loopback peers, rejecting
cross-site Fetch Metadata, a required custom header, HttpOnly SameSite=Strict
session cookies, a per-session CSRF token for every protected operation, JSON
body limits, bounded sessions/concurrency and per-session request limits. No
CORS allowance is added. HTTP (not HTTPS) is allowed only for this loopback test.
The CSRF token stays in memory, not URL/localStorage; the service key never goes
to the browser. Sessions expire after 30 minutes or server restart.

## Booking behavior and UI

The Russian-language workspace provides date and unit selection, a server-created
quote with real PostgreSQL ID/expiry, a temporary reserve, a persisted reservation
list, and explicit release. Money is received in minor-unit strings; UZS display
uses integer arithmetic. Guest inputs here are adult-count fixtures, not PII.
A cost shown in the UI is not a fiscal calculation or a real payment offer.

Each hold/release uses an explicit idempotency key. An uncertain response does not
automatically cause a new-key resend. The UI reloads persisted reservations after
a mutation. A page reload does not erase a DB hold. A Core error is shown rather
than replacing the results with mock records. No confirm/capture/refund/payment
endpoint is enabled through this gateway. Expired holds can be explicitly
released; a continuous generic-hold expiry scheduler is not activated here.

## Verification

`local-core-workspace.integration.cjs --ack=LOCAL_WORKSPACE_TEST` sends real HTTP
requests through the gateway/Core and inspects the resulting local DB rows. It
checks source/CSRF/actor rejection, scoped input validation, server quote totals,
six parallel same-key holds, overlapping competing holds, cross-session quote
denial, persisted list retrieval, release replay, zero created payment intents,
and direct Core auth/property-scope rejection. Only reservations created by the
test are eligible for cleanup; no table/DB reset is performed.

`local-core-workspace.browser.cjs --ack=LOCAL_BROWSER_TEST` uses the installed
Microsoft Edge in an isolated temporary profile via Playwright (no user browser
profile or cookies). It executes quote → hold → page reload → release → quote
again, records screenshots and 360/390/768/1440 width checks, detects JS errors
and service-key headers, and simulates an unavailable gateway response to verify
that the UI reports failure. Simulation is not claimed as a real server outage.
No physical Android or Safari testing is implied.

A negative Host test uses Node's native HTTP client, since the fetch client in
the local Node version did not transmit the supplied Host override. Assertions
were corrected to test what was actually sent; the Host rejection was retained.
Initial browser label ambiguity was fixed with explicit accessible select labels,
not by removing the UI assertions. The Windows Core readiness polling window
was increased for this machine's slower cold start; a follow-up HTTP readiness
check is required before claiming the server available.

## Operation and rollback

Use the existing Desktop VIEWS Local Start / Stop shortcuts. Start now opens the
local workspace. The static review remains available at `?api=demo`. All three
listeners stay on 127.0.0.1; neither firewall rules nor an OS service/autostart is
added. Removing/renaming the private workspace configuration disables this
local gateway after its process is restarted. To roll code back, stop only the
owned local processes before checking out the previous branch; retain the DB,
private configuration and backups. Do not delete those directories or reset the
local database.

Primary security reference: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
Browser channel reference: https://playwright.dev/docs/browsers
