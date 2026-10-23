# Recovery milestone — 0.20

Base: verified 0.19 / PR #90 / `f75d817aa0c331577374926885371d9c174d79f8`.
Remote heads and open PRs were refreshed before creating separate market UI,
booking UI, Core and independent QA worktrees. No competing recovery slice was
found. Earlier conflicting market schemas remain deferred, not blindly merged.

## Finite acceptance

1. Persist the existing local demo market across reload and reopening the same
   browser/application origin. Serialize concurrent mutations, preserve guest,
   staff and read-only owner consistency, and retain v1 carts, pending reviews,
   replacement links and history. Legacy session data may seed an empty durable
   store only after successful commit. Conflicts and unavailable/corrupt storage
   must be explicit; never silently overwrite either source or show false success.
2. Recover an uncertain booking hold with the same quote and idempotency key.
   Date/quote edits must not discard an unresolved operation. Distinguish a
   confirmed hold plus failed list refresh from an unknown write. Replays report
   current status without renewing a hold or manufacturing another reservation.
   Current staff/session/tenant/property authorization remains authoritative.
3. Verify the integrated result using full aggregate/Core/CI, browser RU/UZ/EN
   interruption/retry/Back scenarios and Android installation/reopening. A browser
   migration proof is distinct from an APK upgrade test: a 0.19 session already
   lost when its process closes cannot be recovered by installing 0.20.

## Boundaries

Durable demo records are synthetic local application data, not real orders,
authentication, cloud synchronization, delivery or payment. Core booking tests
use disposable local databases only. No live DB, production/master merge,
credentials, privileges, external messages or infrastructure changes. Migrations
1–132 are frozen; any required correction is additive. No payment tokens are
stored. The existing test APK certificate is retained.

The 0.19 APK and preview remain independently available. This milestone does not
claim completion of the wider platform, physical-device certification or all
roadmap stages. Existing node-forge/braces exceptions remain unpatched tooling
risks under their previous scope and expiry; they are not vulnerability fixes.
