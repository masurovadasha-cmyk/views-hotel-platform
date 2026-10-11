# Stage 7.16 — Core Outbound Egress Boundary

## Goal

Make direct outbound Internet access from VIEWS Core impossible by default before external payment, SMS, fiscalization, registration, or storage adapters are connected.

Stage 7.15 removes direct inbound origin exposure. Stage 7.16 applies the same default-deny principle to outbound traffic.

## Network boundary

Core remains attached to:

- core_ingress
- core_data
- core_egress

All three networks are now internal Docker networks.

Docker documents internal networks as having no default gateway for external connectivity. A service attached only to internal networks cannot use the normal container route to reach the Internet.

cloudflared replicas remain separately attached to tunnel_egress, which is external-capable. Core is never attached to tunnel_egress.

## Why keep core_egress

core_egress remains as an internal transit segment even though it currently has only Core.

A later provider-integration stage can attach a dedicated outbound relay/proxy to this internal segment and a separate provider-facing network. Core itself will still never receive a direct external-capable interface.

Until that controlled relay exists, Core egress is deny-all.

## Topology gate

scripts/core-egress-boundary-gate.mjs fails closed unless:

- Core uses no host network mode;
- Core has no extra_hosts overrides;
- every network attached to Core is internal;
- core_egress exists and is internal;
- Core is the only current member of core_egress.

Attaching Core to any normal/public bridge network fails the gate.

## Source-code network primitive gate

scripts/core-network-primitive-gate.mjs scans production TypeScript source under apps/api/src.

Outside the reserved security/egress boundary it rejects direct:

- fetch()
- node:http / node:https
- node:tls
- node:dns / node:dns/promises
- node:dgram
- generic node:net imports
- undici
- axios
- got
- WebSocket construction

The existing security/network-cidr.ts helper may continue using node:net only for BlockList/isIP-style address classification. Expanding it to socket operations fails the gate.

This prevents a future provider adapter from quietly bypassing the controlled egress architecture in source code.

## Runtime proof

scripts/stage7-core-egress-proof.sh starts the real production-style Core topology with PostgreSQL and all migrations.

It proves:

1. origin-isolation gate remains healthy;
2. Core egress topology gate passes;
3. production source contains no direct outbound primitives;
4. Core /readiness remains healthy through private PostgreSQL connectivity;
5. Core cannot establish raw TCP to 1.1.1.1:443;
6. Core cannot complete HTTPS to example.com;
7. Core cannot establish TCP to 169.254.169.254:80.

Final validated evidence:

/tmp/stage7.16-core-egress-proof.json

## SSRF boundary interpretation

The Docker boundary removes the normal external route.

The source gate prevents direct outbound networking from VIEWS application modules.

Docker notes that internal bridge networks can still have a gateway address associated with the host. Therefore Stage 7.16 does not claim that Docker internal mode alone is a complete host-local SSRF firewall.

The next provider-egress layer must introduce a dedicated relay/proxy plus destination allowlisting and host firewall policy. External provider SDKs must not be connected before that layer exists.

## Compatibility

Current payment, guest-auth delivery, fiscalization, guest-registration, and document-vault integrations are ports/registries and are not connected to external network adapters in the Core runtime.

Therefore deny-all runtime egress is the correct fail-closed baseline today.

## Next work

- dedicated provider egress relay/proxy;
- HTTPS-only destination allowlist;
- DNS rebinding/private-IP rejection;
- per-provider identity, timeout, retry and idempotency policy;
- egress audit telemetry and deny counters.
