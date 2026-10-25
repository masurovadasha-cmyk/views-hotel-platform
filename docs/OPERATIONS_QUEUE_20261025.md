# Q1 — read-only grouped Core service queue

Base: `20decdfff77b2fb59e73496e6e374d1e42e7638b`. Canva SD-GN-001/004 remain **partial**: grouped authorized lists and a selected minimal summary, not full PDF acceptance or a global chronological timeline.

## Contract and security

`GET /v1/service-orders/queue?propertyId=UUID[&kind=cleaning|laundry|market|concierge&cursor=UUID]`. Cursor requires kind. Unknown/repeated query parameters, malformed UUIDs and extra limits are rejected. Initial response has all four `sections`; a kind request returns exactly one section. Each section is `{kind,status,items,nextCursor}` with `available|forbidden|disabled` status. Forbidden/disabled have no rows, count or cursor.

Each request resolves the actual staff session and binds its organization/user/membership to actor headers. Inside `withActor`, `app.registry_access` checks current property permission; existing SECURITY DEFINER staff functions recheck session, property and assignment restrictions. No database schema/grants changed. Read projection only: `{id,kind,stage,revision,unitCode,sla}`. No guest identity, messages, money, assignment identifiers or write commands. Laundry ID is intake ID, not optional resulting service-order ID.

Existing keysets are preserved per service: cleaning/laundry/concierge UUID ascending, market creation timestamp + UUID descending through existing server cursor semantics. Page sizes 50/2/50/2 respectively. This is not a cross-service chronological sort or a transactionally frozen multi-page snapshot. Refresh restarts every service. Source errors fail the entire response; they are not silently presented as empty successful sources. Concierge uses its existing persisted response deadline/hypothesis; other SLA values are null.

## UI and integration

`OperationsQueue` mounts only in authenticated local `StaffWorkspaceGate` when existing service permissions are present. Translation dictionary is separate, RU/UZ/EN. Open/close, refresh, service paging and read-only selected summary use the same endpoint. Refresh/close, offline, revocation and identity replacement clear selection; generation + abort guards prevent delayed responses restoring revoked/stale data. GET timeout is 15 seconds. No demo ledger reads, no new write requests, no public Core activation.

Root-owned wiring required:

- `app.module.ts`: import/register `OperationsQueueService` provider and `OperationsQueueController` controller from `service-orders/operations-queue.*`.
- Local gateway: authenticated GET `service-orders/queue`; only optional kind/cursor from client, trusted configured propertyId and existing authenticated staff actor/session forwarded to `/v1/service-orders/queue`. Preserve no-store, body bounds, origin/session checks. No client-selectable property or permission expansion.
- No shared translation changes required.

Public branch preview/APK has no authenticated Core connection, so it does not expose this live queue; this limitation is intentional. No fake shared queue is substituted. Existing local demo market stays independent.

## Evidence

- Root/web and API typechecks passed.
- API unit contract: 15 tests, including allow-list projection, input bounds, permission filtering, actor/revoked session checks and keyset order.
- Web parser: 11 tests; malformed/forbidden source rejection, exact expected source set, cursor and duplicate row checks, page deduplication.
- Disposable PostgreSQL runner: 4 integration tests + 15 unit tests. Real cleaning/laundry/concierge requests and market reserve; per-service keysets; current organization/property and role boundaries; null concierge assignment visibility then exclusive claim; unassigned cleaning hidden from cleaner; unique session logout. Test seed market product reserve is cancelled and original catalog availability restored. Only disposable-marked database permitted.
- Runner also executes existing 14 market revocation and 14 booking recovery races.
- Independent QA reports EN/RU/UZ browser proof PASS: four sections, pagination, selected summary, delayed close/reopen, forbidden/disabled, 503 clearing, offline, 401 revocation, three widths/two themes, no write requests. Its script/evidence are owned by QA.

No full 140-screen acceptance, new public authorization, payment, dispatch or provider integration is claimed.
