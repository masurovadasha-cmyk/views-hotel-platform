# Stage 7.26 — recipient-bound invitations and durable mail delivery

## Scope

Extends Stage 7.25 in the same repository. Mail is a dedicated worker using
PostgreSQL, not a network escape inside transactional Core. No public registration,
privileged roles, MFA bypass, real email delivery, cloud resource or production
activation is added. Capture mode is local-only and restricted to views.invalid.
SMTP external mode requires explicit approved recipients, sender, zero-new-spend
acknowledgement, verified TLS and a fixed HTTPS origin. These are configuration
gates, not proof that a domain has actually been verified or a cloud plan is free.

The user's Windows computer stopped answering during work. Migration 0040 and
mail code were written there, but the outcome of the queued backup/migration/
package-install process could not be read. Do not claim the workstation updated.
On reconnection, inspect git diff and views_local_migrations before any pull or
migration. Preserve local changes; never rewrite an applied migration checksum.

## Queue and identity binding

mail_jobs is in staff_private, outside public-schema runtime grants. Each job
binds organization, membership, purpose, exact canonical recipient, transport,
key ID and random nonce. Raw bearer tokens and derivation keys are not stored in
the queue. A 256-bit HMAC token is deterministically regenerated only by the
operator/worker using a separate secret key, then checked against the saved
SHA-256 token hash. A key ring allows existing jobs to retain their prior key ID;
missing keys fail closed. This requires backup/rotation of the worker secret key
outside Git/database. Compromise of that key AND queue data compromises pending
tokens; this is not a claim of protection after a mail worker is compromised.

Enqueue is operator-only and idempotent per organization/request ID. A repeated
request cannot change recipient or purpose. Five issues per membership per hour
limit mailbox flooding. A replacement invalidates old tokens and queued mail.
Invites expire after 24 hours; reset tokens after 30 minutes. Existing local
manual invitations remain supported, but may not label themselves verified email.

The existing case-insensitive identity comparison is retained explicitly:
recipient snapshots use lower(trim(email)). This is not a claim that SMTP local
parts are universally case-insensitive. A reviewed change-email flow is not
provided here. A changed email invalidates old tokens, queued messages, sessions
and credential activation, pending re-verification.

## Delivery semantics

Separate staff_mail_ops functions are granted ONLY to a mailer database role,
not the Core runtime. Claim uses SKIP LOCKED, a per-claim lease UUID and a two-minute
expiry. Finish requires the matching unexpired lease. A stale worker cannot write
a result after cancellation or expiry. Known SMTP rejection/pre-connect failure
may retry with backoff, at most three attempts. Ambiguous disconnects/timeouts or
expired leases become uncertain and are NOT automatically resent. The old token
can still prove possession if the message was received before acknowledgement
was lost. No exactly-once guarantee is made for external SMTP.

Nodemailer 10.0.15 is pinned. External SMTP uses requireTLS/verified certificates,
fixed sender/recipient, no files or URL attachments, disabled logs and bounded
connection/greeting/socket waits. The helper is not a scheduled daemon; deployment
must supervise its process and keep database/secret access separate from Core.
No real SMTP credentials are present in source or used in the fixture.

## Verification is not delivery

A mail-accepted receipt alone does not activate a membership and does not mark
email verified. The matching single-use token must be submitted with the new
password, bound to the same current email, member, organization and purpose.
Only a SMTP-channel job plus token consumption can set verified_email and the
verification timestamp. A capture-channel job NEVER sets emailVerified=true.
Reset revokes old sessions and consumes outstanding links. Privileged enrollment
remains prohibited until MFA, delivery and owner approval are ready.

## Link and UI

The token is in a URL fragment, never in the query string. The local mail entry
screen removes it from browser history before rendering and requires deliberate
password submission. GET/link scanners cannot consume a token. no-referrer is
set in the page. Existing login and booking screens are reused, not duplicated.
The external provider, verified sender domain and a real HTTPS staging origin
have not been selected or activated. Public web and APK are unchanged.

## Proof and honest limits

The dedicated CI applies every migration to PostgreSQL 16, compiles the actual
Core, and sends messages using the actual Nodemailer client to a disposable
loopback SMTP receiver. Messages remain in test memory and are never uploaded as
artifacts. API proof exercises activation/login/reset through Core HTTP. Negative
cases cover replay, source binding, superseded/expired tokens, duplicate workers,
leases, key mismatch, uncertain delivery, queue privileges and changed email.

The positive external emailVerified branch is tested by SIMULATING a mailer SMTP
receipt in the disposable database, not by contacting an external email account.
Reports explicitly distinguish this from real capture transport and never claim
external mailbox ownership. No live cloud deployment or external deliverability,
DNS/SPF/DKIM/DMARC, bounce processing or long-running worker availability is proven.

Migration 0040 is applied by the dedicated all-migrations workflow. The older
Production Core workflow's fixed list remains a separate regression against the
previous schema until it is updated during the next integration step. Do not
mislabel that job as evidence for 0040.

## Next activation requirements

Select an approved transactional SMTP provider, sender domain/address and exact
staging test recipient; store credentials/keys in an approved secret store, not
chat. Confirm costs before any external send. Verify sender DNS and actual receipt
on HTTPS staging; then add privileged MFA and recovery before real employee use.
No personal Gmail account is repurposed as an unattended transaction sender.

## Primary references

- https://cheatsheetseries.owasp.org/Email_Validation_and_Verification_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/Forgot_Password_Cheat_Sheet.html
- https://nodemailer.com/smtp
- https://www.postgresql.org/docs/16/explicit-locking.html
- https://nodejs.org/docs/latest-v22.x/api/crypto.html
