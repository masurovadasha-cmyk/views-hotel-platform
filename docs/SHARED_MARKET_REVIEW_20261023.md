# Shared market iteration — 23 October 2026

Base: published 0.18 / PR #89 / `607dc4862f43e6609746bfe70a83c94b69fcbea9`.
Fresh remote inventory also confirms #88 `2413775`, #87 `9806762`, #85 `0628bf6`
and #54 `043f164`; these existing slices are not reapplied. Three isolated workers
own UI/state, Core cancellation and independent browser QA. The coordinator owns
release/CI/checkpoint verification and artifact delivery.

## Finite acceptance set

1. Share one existing per-tab demo order ledger between guest, operational demo
   staff and a read-only owner view. Staff completion/cancellation must appear in
   guest history and quantities. Do not mirror into legacy sample service orders.
2. Preserve v1 cart, pending confirmation, replacement draft and historical links.
   Failed writes, stale actions, role changes, Back/Cancel and repeats must not
   invent a completed operation or silently reset user data. Demo roles are an
   interface rehearsal, never backend authorization. Live/Core modes are isolated.
3. Correct authoritative Core cancellation only where reproducing tests justify
   changes: ready-stage transition, current authorization after waits and replay,
   tenant/property isolation, atomic reserve release without issuing physical stock
   or charging a folio. Corrections append migration 0132; migrations 1–131 are frozen.
4. Run full applicable tests/CI on clean final source, RU/UZ/EN browser journeys,
   migration 131 → 132 proof, branch preview and Android 0.18 → 0.19 upgrade with
   the existing Expo debug certificate. Record exact results in the review PR.

## Scope boundary

Updating data everywhere means all affected local demo surfaces within one tab
and the separately tested canonical Core contract. It does not mean cross-device
sync, a live database, external delivery, payment or notifications. Historical
conflicting market schemas and gateway chains remain deferred as recorded in
`INTEGRATION_CORE_20261022.md`. No production merge or infrastructure redeployment.

## Dependency review

Fresh production audit and npm registry on 23 October still report node-forge
1.4.0 and braces 3.0.3 as latest, with no patched versions for respectively
[GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) and
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
No compatible published upgrade can currently remove these advisories. Neither
is fixed or suppressed further in this iteration; the existing 15 November expiry
and path/published-fix checks remain unchanged.

Observed paths are Expo CLI → node-forge and Expo Metro → metro-file-map →
micromatch → braces. Installed Expo CLI uses forge in iOS code-signing certificate
parsing; this Android review wrapper is packaged/signed with Android SDK tools.
Metro's watcher uses micromatch for configured glob patterns; trusted repository
configuration reduces exposure, but is not a vulnerability fix. These are build
tool dependencies, not a claim that arbitrary untrusted builds are safe. The
current runtime guest/staff request path does not use them. No fork or unreviewed
cryptographic patch is introduced merely to make audit output green.
