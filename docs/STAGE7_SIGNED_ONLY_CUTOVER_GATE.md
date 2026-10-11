# Stage 7.11 — Signed-Only Cutover Evidence Gate

Status: implementation candidate.

## Goal

Convert the Stage 7.9 credential-posture response into a deterministic release gate before a
Stage 7.10 service is switched to or kept in signed-only mode.

The gate is read-only. It does not fetch secrets, change authentication modes, rotate keys or modify
Core state.

## Input

The command consumes a Stage 7.9 posture JSON snapshot from stdin or a file.

Example:

```bash
cat posture.json | npm run security:service-cutover-gate -- \
  --expect=pages-bff,analytics-cron
```

Or:

```bash
npm run security:service-cutover-gate -- \
  --file=posture.json \
  --expect=pages-bff,analytics-cron
```

The posture snapshot should be obtained through the authenticated Stage 7.9 endpoint and handled as
an operational security artifact. It contains no raw service tokens or private keys.

## Blocking conditions

The gate fails when any of the following is true:

- Stage 7.9 global migration readiness is false;
- an expected trusted service is absent;
- a service has no observed signed traffic;
- a service has any legacy symmetric traffic;
- a service is not marked ready;
- a configured signing credential is absent for an observed service;
- none of the currently configured signing credentials for a service has observed traffic;
- a signing credential is overdue;
- signing credential rotation metadata is missing;
- a signing credential is due soon, unless an operator explicitly supplies `--allow-due-soon`.

The due-soon override produces a warning rather than silently discarding the condition.

## Output / exit codes

The command prints only a normalized machine-readable result:

- `ok`;
- expected and observed service IDs;
- blockers;
- warnings.

It does not echo the full input snapshot.

Exit codes:

- 0 — gate passed;
- 1 — posture is valid but release blockers exist;
- 2 — invalid arguments, invalid JSON or malformed/unsupported posture input.

## Release use

Recommended Stage 7.10 sequence:

1. deploy a service in dual mode;
2. collect a representative Stage 7.9 observation window;
3. save the posture response as an approved release artifact;
4. run this gate with the explicit expected service list;
5. switch only the approved service to signed-only;
6. collect another posture window;
7. run the gate again before deleting the symmetric secret;
8. repeat independently for the next service.

## Safety

This gate intentionally does not call the posture endpoint itself. Authentication and secret
handling stay outside the evaluator, so CI can validate a captured response without learning a
service private key.

## Automated acceptance

Tests cover a healthy two-service posture, legacy traffic, missing expected services, overdue and
due-soon credentials, the explicit due-soon override, configured-credential traffic evidence and
malformed snapshots.

## Next work

- connect this gate to the approved remote staging deployment workflow once GitHub Actions and
  staging credentials are available;
- add Core network ingress restrictions;
- evaluate mTLS for supported deployment topologies.
