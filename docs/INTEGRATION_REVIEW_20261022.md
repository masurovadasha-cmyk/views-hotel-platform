# VIEWS integration milestone — 22 October 2026

## Scope and source boundaries

One review candidate combines the current PostgreSQL Core baseline, unified stay
calendar and local demo market. It does not activate public Core, authentication,
real prices, payment, email, stock, delivery or production. The canonical repo is
`masurovadasha-cmyk/views-hotel-platform`; no Vertex/Taxi/Engineers sources enter
this milestone.

Fresh GitHub inventory is retained in `INTEGRATION_BASELINES_20261022.json`.
`ancestorOfBaseline` describes Git ancestry, not a claim that every older branch's
behavior is equivalent. Source checkpoints:

| Slice | Source SHA | Decision |
| --- | --- | --- |
| Current Core / PR54 | 043f164f243ef97f99d0b038d2e7b0918caedc84 | Included transitively; PR84 and PR86 already merged here |
| Unified calendar / PR85 | 0628bf661c90d6b3a5ea05fac74c06fcffb2982f | Included unchanged as the calendar base |
| Demo orders / PR87 | 9806762077d367baf642cab321fbe9d283fce48c | Included, including Next15.5.28 audit fix |

Three concurrent workers start at `9806762` in isolated worktrees with distinct
ownership: frontend guest/calendar code; Core compatibility gate/report; cross-
feature browser QA/report. The coordinator owns release metadata, integration
manifest, CI wiring, final builds and delivery. Worker commits are merged into
`stage7/integration-review-20261022`, not into production or the source PRs.

## Acceptance boundary

- Saved demo stay selection remains coherent across guest, access/role navigation
  and market workflows; cancelled calendar drafts do not replace saved dates.
- Demo order review, confirmation, stock reserve/cancel and repeated actions remain
  local, clearly labelled and idempotent. Invalid/unavailable storage cannot imply
  successful booking or order creation.
- Current Core migration checksums remain unchanged. No duplicate numeric slots,
  hidden second migration root or incompatible parallel market contract is merged.
- RU/UZ/EN, both themes, mobile layout, role separation and existing apartment
  photos remain intact. Catalogue illustrations are not presented as verified SKU
  photographs.
- Aggregate, Core and cross-feature browser tests run on the final clean source;
  branch preview metadata and APK assets match that source. Android debug signing
  reuses the existing Expo certificate; no new identity is generated.

## Deferred history

Older open PRs are not automatically safe to merge. See the frontend and Core
review reports in this directory for exact competing SHAs, migration collisions,
superseded implementations and environment-specific slices. Their source branches
remain untouched. Applied migration checksums must not be rewritten to reconcile a
conflicting historical branch.

## Evidence and limitations

Executed final commands/counts, CI links, tested SHA, preview URL, APK hash and
Library identity are recorded in the integration PR after verification. This
file defines acceptance, not advance claims of successful tests. Public static
demo and locally tested authoritative Core remain separate execution modes.
Physical-device acceptance, external services, real product catalogue and a
production rollout remain outside this milestone.
