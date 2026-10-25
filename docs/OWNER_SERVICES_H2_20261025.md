# H2 owner services read-only rehearsal

SH-GN-001 and SH-GN-003: active UZS catalog and current service orders for an active supported property in the authenticated owner's organization. This is a limited local Core rehearsal, not income, commission, payment, complete order history, guest communications, or production service activation.

`GET /v1/owner-services/:propertyId?kind=catalog|orders&limit=1..50&after=UUID` returns `{propertyId,kind,items,nextCursor,readOnly:true}`. UUID ascending keysets avoid offset duplicates; new rows before the cursor appear after refresh. Current orders exclude completed/cancelled orders and can leave a page as work advances; this is not a snapshot history. Catalog includes actual current price/currency, not inferred financial values.

Migration 0138 is a minimal SECURITY DEFINER projection with fixed pg_catalog search_path and no PUBLIC EXECUTE. It reuses 0135 actual-session owner/manager + property.manage organization ownership semantics; no worker/queue permissions or broader row grants. Both SQL and API revalidate before and after reading, including revocation while the query waits. No guest/profile/reservation identifiers, message, commission, payment fields are selected. Migrations 1–133 are unchanged.

## Coordinator wiring required

- OwnerModule controllers: OwnerServicesController; providers: OwnerServicesService.
- StaffSessionGuard: GET `/v1/owner-services/:UUID` requires property.manage; the service additionally requires owner/manager current session/actor match.
- Local gateway `owner-services/:UUID`: preserve only kind/after/limit query; authenticated actor headers plus actual raw staff session as x-views-staff-session. Never source identity from UI role.
- Enable VIEWS_OWNER_SERVICES_ENABLED=true only with NODE_ENV=test and VIEWS_LOCAL_REHEARSAL=true in the disposable/local pilot. Default public disabled.
- Update migration manifest for 0138 and invoke `apps/api/db/tests/owner-services.cjs({admin,runtimeUrl})` after API compilation in the disposable runner.

## Verified in isolated worktree

- API input/session/pilot tests: 3 passed; UI locales: 3 passed.
- Actual disposable PostgreSQL migrations and compiled service: active/current filtering, strict field allowlists, owner/manager, wrong-role/organization/property/token-actor denial, bounded keysets, session/role/membership/credential/expiry revocation, and observed read-lock wait followed by session revocation passed using views_app without superuser/BYPASSRLS. No PUBLIC execution verified.
- Typecheck and review web build passed.
- `node scripts/owner-services.browser.cjs`: synthetic HTTP boundary, RU/UZ/EN 390px paging, kind switch, offline data clearing, refresh and late-response suppression passed. This test does not assert registered Core HTTP works.

Registered HTTP through guard/module/gateway, integrated aggregate/CI, release web/APK/Android are coordinator checks still required. No live database or access changes were made.
