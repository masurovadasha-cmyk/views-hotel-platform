# S1: versioned SLA drafts and working-calendar simulation

Base: `af653127d781d452aee7c98477eaa9dcb04891d7`. Source screens: Canva
SA-GN-006 (stage deadlines), SA-GN-010 (SLA matrix). This is partial functional
coverage, not full screen acceptance or an approved SLA matrix.

## Finite contract

Four existing services only: cleaning/laundry/market/concierge. A draft describes
one proposed response/acceptance/completion milestone, one supported timezone,
1–1440 elapsed working minutes, and up to 14 weekly windows. ISO weekdays are
1–7; boundaries use local minute precision, with 24:00 allowed only at day end.
Overlap is rejected. There are no holidays, automatic pauses, publication,
notifications, penalties, partner assignments or operational order updates.

Saving appends an immutable revision, using expectedRevision and a command key.
A persisted unknown request retries with recoveryOnly and identical immutable
body. Recovery of an absent command commits not_applied before allowing another
request; a late original cannot save it. Receipt distinguishes the revision
created by the command from the latest current draft. Conflicts/errors do not
clear the browser intent. IndexedDB is scoped by authorized organization/user/
membership/property and contains only operational draft data plus random key;
no credential or guest data. Cross-tab claims are atomic. Corrupt/unavailable
storage blocks writes without resetting stored data.

Simulation references a saved revision, not unsaved form fields. It returns UTC
and local instants plus each counted working segment. Working minutes count
elapsed time, so DST days need not contain 24 hours. Nonexistent/ambiguous input
or working-window boundary times are rejected, not silently shifted. Supported
zones: UTC, Asia/Tashkent, Europe/Berlin, America/New_York. Evaluation is bounded
to 366 calendar days; unreachable targets produce an explicit horizon error.
All output is labelled simulationOnly/approved:false. Existing concierge
responseDueAt values and its 15-minute pilot hypothesis are untouched.

## Security and schema

Migration 0139 creates append-only draft versions and terminal command records.
RLS requires existing reservation.manage/property scope; role labels are not
permissions. No UPDATE/DELETE policies or PUBLIC privileges. The API requires an
existing staff session on every path and uses the existing 0133 current-session
predicate, rechecking after both command/policy waits and before commit/return.
Feature requires NODE_ENV=test, VIEWS_LOCAL_REHEARSAL=true and
VIEWS_SLA_POLICY_DRAFT_ENABLED=true. It is off by default. No credentials are
provisioned by runtime code. Proof credentials exist only in the disposable DB.

## Executed evidence

- Seven calendar unit cases: UTC/Tashkent, closed hours/weekend, midnight,
  leap day, maximum target, genuine New York/Berlin DST gaps/folds, elapsed DST
  duration, invalid boundaries, overlap and horizon exhaustion: PASS.
- Five client model/localization cases: scoped intent and data minimization,
  terminal receipts/current revision, overlap, simulation arithmetic, RU/UZ/EN:
  PASS. Root/API TypeScript and builds: PASS.
- `node scripts/sla-policy.browser.cjs`: real Chromium component harness,
  EN/RU/UZ PASS. Persistence before POST, lost receipt/reload/two tabs, 403 retry,
  confirmed save with refresh failure, saved-version simulation and DST error
  display, CAS conflict recovery, 360/768/1440 widths and actual app Light/Dark.
  No external requests or page errors. This is not integrated-route/public proof.
- `node scripts/sla-policy-disposable.cjs`: actual PostgreSQL container, random
  loopback port, database marker and views_app non-superuser/RLS runtime: PASS.
  Applied base migrations 1–136 plus 0139 (137 scripts); no edits to history.
  `apps/api/db/tests/sla-policy-proof.cjs` verifies CAS race, current replay,
  not-applied fencing, calendar result, denied role/property/tenant, 16 observed
  command/policy lock revocations, and unchanged deadlines of a real synthetic
  concierge record. Container and ephemeral passwords removed afterward.

## Coordinator wiring (not changed by this worker)

1. Import SlaPolicyModule into AppModule; append 0139 to manifest. Test-only grant:
   SELECT,INSERT ON sla_policy_draft_versions,sla_policy_draft_commands TO views_app.
2. Admit /v1/sla-policy, /drafts, /simulate through the existing staff-session
   boundary; never create a new public authentication mechanism.
3. Gateway maps the corresponding /local-api paths. Require reservation.manage,
   the existing staff session, and the authorized fixture property. GET query and
   POST body propertyId must equal that property. Forward the token as usual.
   Draft POST additionally requires UUID Idempotency-Key. Simulation POST is read
   only and does not need a command key. Keep the feature flag default off.
4. Render SlaPolicyWorkspace({propertyId,staffCsrf}) under StaffLocaleProvider in
   the existing authorized Core staff interface. No public-demo role grants access.
5. Invoke sla-policy-proof.cjs({admin,runtimeUrl}) after compiled API/migrations in
   disposable aggregate CI; then run integrated-route RU/UZ/EN and browser gates.

Final integrated SHA/CI/web/APK are coordinator responsibilities. This isolated
slice does not establish production readiness or alter the released 0.21 APK.
