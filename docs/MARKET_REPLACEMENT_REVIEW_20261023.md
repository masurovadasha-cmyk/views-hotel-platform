# VIEWS reserved-order replacement review — 23 October 2026

This bounded milestone extends the verified 0.17 integration candidate, not the
production branch. The source checkpoint is PR #88 at
`24137758f9e94247375d906d4f6746c80b5e14ee`. Refreshed GitHub heads remain #54 at
`043f164f243ef97f99d0b038d2e7b0918caedc84`, #85 at
`0628bf661c90d6b3a5ea05fac74c06fcffb2982f` and #87 at
`9806762077d367baf642cab321fbe9d283fce48c`; none needs replaying.

## Bounded contract

- A reserved local demo order can be edited without releasing its original stock
  before confirmation. An atomic replacement preserves the old order in history,
  links old and new orders and prevents repeated confirmation from reserving twice.
- Existing v1 tab state survives the upgrade. Drafts and pending confirmations
  survive interruption; failed storage writes cannot report a successful order.
- Authoritative Core already supports `replace_order`. Its existing contract is
  reused, with a focused review of current authorization after lock waits and
  idempotent replay. Historical migration files are never renumbered or rewritten.
- Public demo stock and Core inventory remain separate. No price, payment,
  delivery or authentication is invented or enabled by this work.

## Parallel ownership and historical decisions

Three isolated worktrees start from the same checkpoint: frontend owns demo
state/UI/translations; Core owns replacement authorization regressions and any
necessary additive correction; QA owns an independent browser upgrade/replacement
proof. The coordinator owns release metadata, CI, integration and delivery.

Old PRs #58–62 contribute requirements to review (atomicity, inventory integrity,
idempotency and scoped replay), not a competing implementation. Their wholesale
merge remains inappropriate: the canonical Core has `service_orders` and
`market_orders`, while historical 0035–0040 slots collide with applied canonical
history. The detailed frozen ledger in `INTEGRATION_CORE_20261022.md` still applies.
Older Staff gateway branches #63–77, Windows #55 and tunnel #42 remain deferred;
this milestone does not change external connectivity or staff authentication.

## Acceptance evidence

Final tested SHA, counts, CI links, branch preview, APK hash and confirmed Library
identity are recorded in the draft PR after execution. Required scenarios include
replacement with zero unreserved stock, shortage, discard, repeated confirmation,
old-state reload, storage failure/retry, terminal order protection, RU/UZ/EN,
calendar/navigation regression and Android installation with the existing debug
certificate. Local disposable Core tests never target a live database.
