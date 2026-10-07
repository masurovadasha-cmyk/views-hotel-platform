# Stage 7.30 — password-change confirmation in the staff UI

The local staff password form now handles the server's STAFF_ASSURANCE_REQUIRED
response explicitly. It clears both passwords, explains the requirement, and
shows an explicit button to confirm with an existing passkey. WebAuthn uses the
existing CSRF-protected options/verify endpoints. The browser does not decide
whether assurance is sufficient; PostgreSQL still checks every mutation.

Confirming a key never resubmits a password change. After successful confirmation,
the employee re-enters both passwords and explicitly saves. Cancelling a key
prompt leaves the password unchanged by that attempt and allows another prompt
or closing the form. Closing the form, logout and an expired session clear the
password fields. Nothing is persisted in browser storage.

A network failure, malformed response or server error during password submission
has an unknown outcome. The form returns to login and explains that the password
may have changed, suggesting the new password first, then the previous one. It
never automatically retries a password mutation. A successful response displays
the existing all-sessions-revoked notice. Deterministic client errors continue to
show their normal messages.

The disposable Chromium proof covers form clearing, server refusal, four widths,
user cancellation without a password request, UV followed by explicit resubmission,
revoked old sessions and a deliberately lost response after the server commits.
Existing server concurrency, expiry, recovery, mail and restore proofs remain in
the same suite. Run `npm run build`, required repository checks, then with local
ports free `npm run cloud:test:passkey`; restore the local runtime with
`npm run cloud:start` and run cloud:test:auth / cloud:test:browser.

No SQL migration or role expansion is involved. This remains a local pilot;
production, real email and privileged access remain gated. Virtual authenticators
do not establish compatibility with a physical phone or security key.

## Executed evidence — 7 October 2026 (Asia/Tashkent)

Validation used the dirty continuation of `6e94599`; the ignored integration
report records that parent SHA and sourceDirty=true. Web/Core typechecks and
builds passed, along with 220 root tests (36 files), 19 staff-auth tests (3 files),
15 mail-policy tests and the network gate (116 files, no findings). The full Core
suite was not rerun because this increment changes no Core implementation.

The combined disposable proof passed 47 groups, including six new browser groups.
Each new UI fixture has its own virtual authenticator, avoiding interaction with
previous memberships' resident credentials. Both network loss and an injected
503 after a committed password change were exercised. Restore still compared
69 tables, seven private auth tables and eight recovery-code rows. These are
local results, not hosted CI or physical authenticator validation.
