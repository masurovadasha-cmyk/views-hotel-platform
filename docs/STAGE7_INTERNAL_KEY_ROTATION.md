# Stage 7.2 — Zero-Downtime Internal API Key Rotation

Status: implementation candidate.

## Goal

Rotate the server-to-server internal authentication secret without requiring the Pages BFF and the
Core API to switch at exactly the same instant.

Stage 7.1 made Core actor headers trusted only when `X-Views-Internal-Key` is valid.
Stage 7.2 changes Core verification from one accepted secret to a short key ring:

- current key;
- optional previous key.

The sender still sends exactly one key.

## Configuration

Core current key:

- `VIEWS_INTERNAL_API_KEY`

Core temporary previous key:

- `VIEWS_INTERNAL_API_KEY_PREVIOUS`

Pages/BFF sender key:

- `VIEWS_CORE_API_KEY`

Requirements:

- current Core key is required in production;
- current and previous values, when present, must each be at least 32 characters;
- an identical previous/current value is deduplicated;
- previous key is optional and should exist only during a rotation window.

## Verification behavior

Core builds:

`internalApiKeys = [current, previous?]`

Internal authentication:

1. hashes the provided key once;
2. hashes every configured accepted key;
3. performs a constant-time digest comparison against every candidate;
4. accepts when any candidate matches;
5. fails closed when the accepted-key ring is empty or no candidate matches.

The comparison loop does not stop after the first match.

## Zero-downtime rotation procedure

Assume:

- old key = K1
- new key = K2

### Step 1 — expand Core acceptance

Deploy Core with:

```text
VIEWS_INTERNAL_API_KEY=K2
VIEWS_INTERNAL_API_KEY_PREVIOUS=K1
```

Pages/BFF may still send K1.

Core accepts both K1 and K2, so existing traffic continues.

### Step 2 — move senders

Update Pages/BFF:

```text
VIEWS_CORE_API_KEY=K2
```

Deploy/restart the sender.

Verify:

- Dashboard BFF succeeds;
- internal report-cycle caller succeeds;
- Core actor requests succeed;
- no `INTERNAL_API_UNAUTHORIZED` increase.

During this window an emergency sender rollback to K1 remains possible because Core still accepts K1.

### Step 3 — contract Core acceptance

After all trusted senders use K2 and the observation window is clean, remove:

```text
VIEWS_INTERNAL_API_KEY_PREVIOUS
```

Redeploy Core.

K1 is now rejected.

## Emergency rollback

If a sender rollout fails before Step 3:

- restore sender to K1;
- Core continues accepting K1 via `VIEWS_INTERNAL_API_KEY_PREVIOUS`;
- diagnose the sender;
- repeat Step 2 later.

Do not remove the previous key until all trusted senders are verified on the current key.

## Security rules

Both current and previous keys are server secrets.

Never place them in:

- Vite/browser environment;
- query strings;
- URLs;
- response bodies;
- source code;
- analytics payloads;
- logs.

The existing redacting logger masks `x-views-internal-key`.

The previous key should be short-lived. Keeping old secrets indefinitely defeats the purpose of
rotation.

## Trust boundaries covered

The accepted key ring is used by:

- global Core actor-header guard;
- canonical Dashboard controller defense-in-depth check;
- internal analytics/report-cycle controller.

Pages/BFF continues sending only its configured current `VIEWS_CORE_API_KEY`.

No browser changes are required for key rotation.

## Production startup

Production still fails closed when the current `VIEWS_INTERNAL_API_KEY` is absent.

A previous key alone is not sufficient to start production.

This prevents an old credential from silently becoming the permanent primary credential.

## Automated acceptance

Tests verify:

- current key accepted;
- previous key accepted;
- single-key backward compatibility;
- missing/mismatched key rejected;
- empty accepted-key ring rejected;
- previous key accepted through the global actor gateway;
- short previous key rejected at configuration load;
- identical current/previous key deduplicated;
- production with one current key remains valid;
- VIEWS CI and Production Core typecheck/tests/build remain green.

## Operational recommendation

Use independent high-entropy secrets per environment:

- staging;
- production.

Never reuse the same internal key across environments.

Keep the rotation window as short as operationally practical.

## Next work

- key identifier/fingerprint in security telemetry without exposing secret material;
- centralized trusted-service request audit;
- optional asymmetric signed service identity/JWT;
- longer-term mTLS/service mesh when deployment infrastructure supports it.
