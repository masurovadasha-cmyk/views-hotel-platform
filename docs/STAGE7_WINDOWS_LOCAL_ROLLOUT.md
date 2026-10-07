# Stage 7.31 — safe Windows rollout and real-device passkey evidence

This stage prepares the verified Stage 7.26–7.30 branch for the existing
loopback-only Windows rehearsal. It does **not** make the local host public,
enable production, send external email, activate payments, merge main, or claim
a physical authenticator succeeded before a user actually completes its OS prompt.

## Why this stage exists

The hosted disposable suite now proves the application flow with a virtual
WebAuthn authenticator, but the user's Windows checkout and persistent local
PostgreSQL were intentionally left untouched by that CI fix. The next operation
must preserve local data, applied migration checksums and private auth tables
before applying migrations 0041–0044 and rebuilding the local Core.

The physical-device check is necessarily partly interactive. Windows Hello and
security-key user verification happen in OS-controlled UI. The application can
prove that a real local WebAuthn ceremony reached Core, stored/used a public key,
created the expected audit event and set fresh session assurance. With the
current schema it cannot cryptographically attest the authenticator's commercial
make/model. The final report therefore records the operator-observed authenticator
separately from database evidence.

## Rollout command

Only on the authorized Windows rehearsal machine, on a clean checkout of
`stage7/windows-passkey-rollout-v1`:

```text
node apps/api/ops/windows-local-rollout.cjs apply --ack=LOCAL_STAGE731_ROLLOUT --expected=<exact-current-sha>
```

The command fails closed unless:

- the branch is exactly the Stage 7.31 rollout branch;
- `<exact-current-sha>` is the checked out SHA;
- the verified `0903a01` CI commit is an ancestor;
- tracked and untracked source are clean;
- every already-applied migration still matches its saved SHA-256;
- migration 0040 is already present.

Before applying anything it stops only the owned loopback web/Core processes,
leaves PostgreSQL running, creates a full custom-format backup, restores it into
a temporary database, and compares row counts plus row-content digests for every
`public` and `staff_private` table. The temporary database is then dropped while
the backup is retained under `%LOCALAPPDATA%\\VIEWS-Staging\\backups`.

Only after the restore proof passes does it invoke the existing migration helper,
build web and Core from installed dependencies, restart loopback services and
re-verify the restricted runtime role/listeners. A failure writes a redacted
report and does not silently restore or delete the retained backup.

Evidence is written to:

```text
%LOCALAPPDATA%\VIEWS-Staging\evidence\stage731-local-rollout.json
```

The rollout script does not fetch Git, install packages, edit the firewall,
install Windows services, reboot the machine or open a public tunnel.

## Real-device passkey proof

After a successful Stage 7.31 rollout, start an interactive observation:

```text
node apps/api/ops/windows-physical-passkey-proof.cjs begin --ack=LOCAL_PHYSICAL_PASSKEY_PROOF --expected=<same-sha>
```

This opens **http://localhost:4173/?api=local-core** in Edge. `localhost` is
intentional: the passkey pilot fixes its local RP ID to `localhost`, while the
ordinary booking review may also be opened through `127.0.0.1`.

Log in with the existing local staff fixture. Do not send the password or any
recovery code to chat. In **Ключ доступа**:

- if no key is registered, enter the current password, choose
  **Зарегистрировать ключ**, then complete Windows Hello/security-key user
  verification;
- if a key already exists, choose **Подтвердить ключом** and complete the prompt.

The browser action itself is the user-presence step. After observing the OS
prompt and success in the UI, finish with one of:

```text
node apps/api/ops/windows-physical-passkey-proof.cjs finish --ack=LOCAL_PHYSICAL_PASSKEY_PROOF --expected=<same-sha> --authenticator=windows-hello --user-verified=yes
node apps/api/ops/windows-physical-passkey-proof.cjs finish --ack=LOCAL_PHYSICAL_PASSKEY_PROOF --expected=<same-sha> --authenticator=security-key --user-verified=yes
```

Other allowed observation labels are `platform-passkey` and `other-local`.

The finish command requires durable database evidence: expected passkey count,
a valid stored public key, a fresh `staff.passkey_registered` or
`staff.passkey_verified` audit action, and a fresh session assurance proof.
It explicitly records that hardware make/model attestation is **not**
cryptographically proven by the current schema.

Evidence is written to:

```text
%LOCALAPPDATA%\VIEWS-Staging\evidence\stage731-physical-passkey.json
```

## CI coverage

`windows-local-rollout-safety.test.mjs` exercises only pure fail-closed logic:
source binding, migration checksums/order, full restore manifests and passkey
evidence assessment. CI does not pretend to be Windows Hello and does not touch
the user's database. The two Windows operator scripts are additionally syntax
checked through the normal repository build/review process.

## Remaining gates

A successful local Windows Hello/security-key check still does not enable
privileged production roles. Real email ownership, public HTTPS/Secure cookies,
approved privileged MFA policy, actual sender infrastructure, monitoring,
physical Android update/signing tests and production rollout remain separate
owner-approved stages.
