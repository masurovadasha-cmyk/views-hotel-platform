# Stage 7.25 — invitation-only staff authentication for the local Core workspace

## Delivery scope

The local React booking workspace no longer creates an authenticated fixture
session on GET /local-api/session. Employees must activate an operator-issued
invitation, set their own password, and log in. The existing PostgreSQL Core
still owns pricing, holds, inventory and booking state; no second booking engine
or alternative identity database is introduced.

This is an actual password/session implementation tested against a SYNTHETIC
local property, not activation of production accounts. It remains disabled
unless VIEWS_STAFF_AUTH_PILOT_ENABLED=true, NODE_ENV=test and
VIEWS_LOCAL_REHEARSAL=true. Production-mode authentication is deliberately
refused. Real email verification, privileged MFA, recovery delivery and a public
HTTPS deployment must be completed before lifting that boundary.

## Invitation and recovery

There is no public registration or role-selection API and no first-user-admin
rule. Invitation/reset issuance is an operator-only function in staff_private,
not in the app schema that the runtime can execute. It binds a random 256-bit
one-time token to an existing membership, purpose, expiry, and credential version.
Only its SHA-256 digest is stored. Acceptance atomically consumes the token,
sets the credential and revokes prior sessions. Replays cannot change a password.

Local pilot issuance uses verification_channel=local_fixture. It NEVER marks
emailVerified=true or claims a message was delivered. A future reviewed email
transport must establish possession before enabling real staff accounts.

The current operator issuance allowlist is front_desk, housekeeper, technician,
and concierge. Owner, manager, finance and platform administrator enrolment is
not enabled by this pilot; privileged MFA and owner approval are not bypassed.

On the authorized Windows rehearsal:

```text
node apps/api/ops/prepare-staff-pilot.cjs --ack=LOCAL_STAFF_PILOT
node apps/api/ops/prepare-staff-pilot.cjs --ack=LOCAL_STAFF_PILOT --reset
```

These commands target only the exact existing local fixture membership. They
write a one-time code to the existing ACL-restricted VIEWS-Staging/private
folder, never stdout, Git, browser assets or a public endpoint. They do not
choose the user's password. Account activation is completed in the browser.

## Password storage

Uses asynchronous Node scrypt: N=131072, r=8, p=1, unique 16-byte salt and 64-byte
output, with a bounded memory setting. At most two derivations run concurrently
per Core process. The stored encoding has fixed validated parameters; a database
value cannot request unbounded work. Unknown accounts use equivalent dummy
scrypt work and the same failed-login message.

Passwords accept 15–128 Unicode characters after NFC normalization, do not get
trimmed or silently truncated, and reject controls. A minimal local common-value
blocklist is included; it is not advertised as a comprehensive breached-password
check. No mandatory composition gimmick or periodic forced rotation is added.
A larger offline blocklist and production abuse testing remain release gates.

## Sessions and database privileges

Raw 256-bit session tokens are exchanged only between browser HttpOnly cookie,
trusted local gateway and Core. PostgreSQL stores only their SHA-256 digests.
Sessions have an eight-hour absolute expiry and a thirty-minute idle timeout.
The core rechecks the current user, membership, credential version, role and
permissions on each resolved session. Suspension and role changes revoke old
sessions permanently; restoring a membership does not resurrect its old token.
Password changes/reset and logout-all invalidate every session of that membership.
Up to five active sessions are retained; older ones are revoked.

Credentials, reset tokens and sessions live in staff_private, outside broad
public-schema runtime DML grants. The runtime has no direct access to that
schema or the issuance function. Narrow SECURITY DEFINER functions use a fixed
pg_catalog search path and explicit schema-qualified references. These functions
are a trusted application-tier API, not a defence against compromise of the
runtime database credential itself. Business data continues to use actor-scoped
transactions and existing organization/property RLS.

Application audit_log stores safe login/logout/password/invitation event metadata,
not raw tokens, passwords or reset codes. The existing rate-limit counter service
is reused with HMAC account/source keys; account limits persist across restarts.
Logs redact the new staff-session header and password fields.

## Gateway and backend enforcement

The gateway cannot manufacture a static actor any more. Each business request
resolves the opaque token through Core and uses the returned organization/user/
membership, never browser-supplied actor or role fields. A new Core global guard
independently verifies the session/actor match and reservation.read or
reservation.manage for the narrow local-workspace service route allowlist.
A service key alone is not enough to invoke those business routes.

The gateway retains exact loopback Host/Origin/custom-header/Fetch Metadata
checks, anti-CSRF token binding, bounded body/response size, limited concurrency
and per-session quote ownership. Cookie: HttpOnly, SameSite=Strict, path
/local-api. The Secure flag cannot be relied on in this explicit HTTP loopback
rehearsal: HTTPS plus Secure cookies are mandatory before any public release.
No gateway endpoint accepts a generic URL or opens payment/provider operations.

The CSRF value is bound to the staff token and server key, not an untrusted
browser actor. Session validity is stored in PostgreSQL and survives gateway
recreation. Per-session quote cache is not durable; after a gateway restart a
quote may need recalculation. Existing holds remain in PostgreSQL.

Revocation prevents subsequent authorization. Already authorized transactions
in flight are not forcibly cancelled or claimed to be globally serializable
with offboarding. Same-Windows-user processes remain in the rehearsal trust
boundary. No Internet listener, tunnel, firewall rule or system service is added.

## UI and tests

Russian staff login, invitation acceptance, operator-issued reset, logout,
logout-all and password change precede the same connected workspace. A 401 from
Core removes the protected UI rather than falling back to demo data. The broad
existing Guest App/Staff CRM are not silently reclassified as production-ready.

Tests include fixed-cost salted password verification, weak/invalid inputs,
backend permission rejection, static-actor rejection, and default-off mode.
The local HTTP proof creates only a NEW unprivileged synthetic employee, accepts
one invitation, exercises password login and CSRF, uses the actual quote/hold/
release flow, then tests session revocation and password change. The browser
proof uses installed Edge in an isolated temporary profile, not the user's
existing cookies or profile. It verifies login, cookie flags, persisted booking,
gateway restart, logout, and responsive widths. Reports preserve the tested SHA
and whether tracked source was dirty; only completed runs are reported as pass.

## Remaining production gates

Real invitation/email delivery, verified email ownership, MFA for privileged
accounts, owner-approved account administration, audited reset delivery, hardened
public HTTPS ingress, distributed abuse limits, session retention/cleanup policy,
and independent security review are not claimed complete. Pilot account data is
synthetic and the current published web/APK remains unchanged.

## Primary references

- OWASP password storage and scrypt parameters: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- OWASP session regeneration/revocation and timeouts: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- Node 22 crypto scrypt: https://nodejs.org/docs/latest-v22.x/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback
