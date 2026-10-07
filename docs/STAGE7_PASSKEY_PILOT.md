# Stage 7.27 — local WebAuthn step-up pilot

This increment adds passkey registration and proof of possession to the existing
nonprivileged staff session. It prepares the cryptographic and transaction
boundary for privileged MFA. It does not enable privileged login, make passkeys
mandatory for bookings, or provide production MFA/recovery.

## Activation and architecture

`VIEWS_STAFF_PASSKEY_PILOT_ENABLED=true` is required in addition to the existing
`NODE_ENV=test`, local rehearsal and staff pilot flags. Default deployment stays
off. No environment variable can bypass the staff pilot's production denial.
The RP ID is fixed to `localhost` and the expected origin to local web port 4173;
these values cannot come from request headers or the browser. A production RP
and HTTPS origin require a separate reviewed configuration and rollout.

SimpleWebAuthn server 14.0.3 and browser 14.0.0 are pinned in committed lockfiles.
Only ES256/RS256 and `none` attestation are accepted. Attestation formats that
could require external certificate/metadata services are rejected before
verification. User presence and user verification are mandatory. Biometric data
and authenticator private keys never reach the application.

Registration requires a live session and re-entry of the current password.
Only one passkey per membership is supported; password alone cannot replace an
existing passkey. Authentication binds credential ID, membership, RP, origin,
challenge and signature, checks the signature counter, and rejects cross-origin
ceremonies. Resident credentials are scoped to the membership, not just email.

Migration 0042 adds private passkeys and one-use challenge tables plus a short
proof expiry on the existing session. It leaves migrations 0039–0041 unchanged.
Challenge values are stored as SHA-256 digests. Ceremonies expire in two minutes,
supersede earlier pending requests for that session, and are claimed atomically
before cryptographic verification. Failure consumes the ceremony. Completion
rechecks session expiry, revocation, role and password version under locks; only
one concurrent completion can succeed. Proof lasts at most five minutes and
never transfers to another login session. Database routines are unavailable to
PUBLIC, and private tables are unavailable to the application and mailer roles.

## Reproduce the local proof

Build web and Core, then use the disposable suite:

```sh
npm run build
npm --prefix apps/api run build
npm run cloud:stop
npm run cloud:test:passkey
npm run cloud:start
```

The suite reuses the marked disposable PostgreSQL and loopback SMTP fixture,
launches Chromium with a virtual CTAP2 authenticator, and runs the actual React
panel, gateway, Core and SQL functions. It captures no private authenticator
keys in artifacts. The existing mail and restore checks run in the same suite.
Results record actual HEAD/dirty state in ignored `mail-evidence/integration.json`.
A virtual authenticator does not prove operation on a physical phone/security key.

## Privileged role and recovery release design

Existing front_desk/housekeeper/technician/concierge role allowlists stay intact.
Future privileged access must be separately reviewed and require server-resolved
role/tenant/property permissions, verified email, password plus UV WebAuthn,
and a fresh assurance check inside each sensitive operation's transaction.
The UI badge alone must never authorize a privileged action.

Before privileged enrollment: add a second-factor/recovery ceremony that cannot
be satisfied by email/password alone. Recovery codes must be random one-use
secrets stored only as digests, shown once after UV proof, rate-limited, audited,
and consumed atomically. Lost-all-factors recovery needs an approved identity
verification process with appropriate independent authorization, notification
and session/key revocation; it must not silently replace a key after email reset.

Still required: factor replacement/revocation UX, audited recovery, public HTTPS
and actual email ownership proof, physical authenticator/device matrix, risk
review and explicit owner approval before granting privileged roles. No new
paid service, external mail, public endpoint or background worker is activated.

## Executed verification — 7 October 2026 (Asia/Tashkent)

The initial checks ran on the dirty continuation of `8123228`; the machine
report records the exact source and dirty state. Commands exited successfully:

- Web/Core builds and typechecks; root suite: 220 tests / 36 files.
- Complete Core suite in disposable PostgreSQL: 258 tests / 53 files, including
  four new activation/validation boundary tests. Source network gate: no findings.
- Mail policy suite: 15 tests.
- Existing staff HTTP proof: 13 groups / 32 requests. Chromium booking proof:
  login, quote, hold, reload, release, gateway restart and logout all pass at
  360/390/768/1440 widths, with no page errors.
- Combined disposable proof: 29 groups, including 10 passkey groups. Actual
  signature verification, UV requirement, credential/user-handle binding, replay,
  tenant/session boundaries, rate bound, expired/superseded challenges, and
  completion after row-lock expiry are asserted. Reset/offboarding revoke proof.
- Full database restore compares 68 tables, including 6 private auth tables;
  the worker keyring stays outside the dump and virtual authenticator private
  keys stay outside PostgreSQL.

Browser registration exposed a PostgreSQL regex repetition-bound error at first
insert. The corrected constraint checks ID length separately from its alphabet;
the real enrollment proof exercises this path. Migration 0042 was tested in a
disposable database before applying it to cloud development, after saving a
private full database dump. Applied 0040/0041 checksums remain unchanged.

GitHub API access to PR metadata returned Forbidden. Git transport still works;
local evidence must not be represented as a hosted CI result. No Windows rollout
or physical security-key validation is claimed.

## References

- https://simplewebauthn.dev/docs/packages/server
- https://simplewebauthn.dev/docs/packages/browser
- https://www.w3.org/TR/webauthn-3/
