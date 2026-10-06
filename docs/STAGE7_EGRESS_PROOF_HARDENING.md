# Stage 7.16 — Measured egress proof and source-policy repair

This change repairs PR #43 without deploying or merging production.

## Source policy

The gate uses the existing TypeScript compiler API, not regular-expression matching of source text. Explicit type imports/exports and import types are excluded from runtime checks. Named node:net imports are allowed only for BlockList, isIP, isIPv4 and isIPv6. Runtime HTTP/TLS/DNS/socket modules, known HTTP client packages, runtime re-exports, dynamic module access, and direct global fetch/WebSocket/EventSource references are inspected. Parse errors and empty scans cannot pass.

The security/egress directory remains a reserved reviewed implementation boundary. Tests and declaration files are excluded. This linter is not a sandbox, cannot prove safety of arbitrary dynamic JavaScript or dependencies, and does not replace network isolation.

## Proof execution repair

The previous script piped JavaScript into `docker exec ... node -` without `-i`. A zero exit status alone was therefore insufficient evidence that probes ran. Every probe now uses `docker exec -i`, emits a structured measurement, and must match kind, target, port, attempted=true and the expected outcome.

Positive controls use the same probe implementation: Core to PostgreSQL; an HTTP service on a separate temporary bridge; and public TCP from an external-capable control container. Only after these pass may the corresponding negative checks run from Core. Any HTTP response, including 4xx/5xx, counts as reachable. DNS failures, invalid certificates and unknown errors are inconclusive rather than proof of isolation.

The report is initialized as failed and becomes pass only after all measured assertions succeed. The JSON is serialized and validated in Node, not assembled from unchecked shell strings. It includes timestamps, commit identity, positive controls, and individual outcomes. Temporary networks, containers and database volumes belong to a unique disposable Compose project. An explicit DISPOSABLE_DATABASE_ONLY acknowledgement is required; cleanup never targets the deployment's ordinary Compose project.

## Limits

This is a sampled IPv4 transport proof, not an exhaustive firewall audit. A failed handshake to link-local metadata does not prove that every cloud metadata route is blocked. The test never requests or reads metadata. DNS forwarding, IPv6, host-root access, malicious dependencies and a compromised connector remain outside this acceptance proof. No external provider adapter or outbound relay is enabled by this change.

## Primary references

- TypeScript type-only imports: https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html
- TypeScript compiler API: https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API
- Docker exec stdin: https://docs.docker.com/reference/cli/docker/container/exec/
- Docker bridge isolation: https://docs.docker.com/engine/network/drivers/bridge/
