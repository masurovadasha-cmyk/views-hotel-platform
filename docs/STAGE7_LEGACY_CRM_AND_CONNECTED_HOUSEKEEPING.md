# Stage 7.49–7.50: remaining CRM languages and connected housekeeping proof

All eight legacy staff components now use an explicit text catalog (547 entries,
including role/status aliases) for RU/UZ/EN. The legacy CRM shares the staff
preference with the connected Core workspace, while guest language remains
separate. Only the active surface writes its preference; language changes do not
send API writes, translate user-entered descriptions/names, or change enum values.
Operational dates use Tashkent time; canonical analytics minor units remain
BigInt strings when formatted. Unknown technical/server values remain literal.

The legacy mobile role navigation is reachable above the task dock. Task sheets
can close, role/navigation controls have accessible labels, and inbox tabs now
actually filter and sort by priority. The resolved tab does not claim a date
filter that the data cannot support. Photo buttons no longer claim a capture
without an upload implementation. Unconnected demo listing/assignment/advanced
filter controls are visibly disabled. This is not new provider integration.

The owner/housekeeper screens from Stage 7.47–7.48 remain separately gated. The
normal launcher still creates no privileged or housekeeper accounts.

## Real Core housekeeper rehearsal

`npm run cloud:test:housekeeping` extends the existing **disposable** Core runner:

1. Creates its own labeled PostgreSQL container, random loopback DB port and
   generated runtime credentials; applies migrations and authoritative CI fixtures.
2. Runs all 298 Core tests, then checks the disposable database marker.
3. Uses only the new CI housekeeper fixture, setting a generated password and
   invalidating its prior disposable session version.
4. Starts the actual Nest AppModule/global guards on loopback 3001 and the normal
   gateway/static web handler on loopback 4173. The test harness binds explicitly;
   it does not replace or claim production-bootstrap validation.
5. Chromium logs in with the real password, loads the scoped queue, claims,
   reloads, releases, claims again, cancels a confirmation, completes, reloads and
   logs out. PostgreSQL completion/assignment and four audit/outbox effects match.
6. Queue rows contain no guest fields; reception access, property injection and
   post-logout reads are denied. Browser page errors/external requests: zero.

Both fixed web ports must be free. Stop only the owned local rehearsal and always
restart it, including on failure:

```sh
npm --prefix apps/api run build
npm run build
npm run cloud:stop
(trap 'npm run cloud:start' EXIT; npm run cloud:test:housekeeping)
```

This exact sequence passed and the persistent runtime resumed with 49 migrations,
zero new migrations and readiness true. No persistent account was changed. It
proves a synthetic housekeeper journey through actual HTTP/Core/PostgreSQL; it
is not staff rollout, real-room inspection or privileged owner login acceptance.

## Verification

Base SHA `eb812dca0be91c7674b24ffc8fd027c1dfb11f73`, dirty increment, 7 October
2026 UTC (completion after midnight on 8 October in Tashkent). All final checks
below exited 0. Earlier browser failures exposed inactive-language preference
writes and a test reading a remounted analytics panel before data arrived; active
preference persistence and a data-specific readiness wait resolved them.

- Root typecheck, web build and Android web build; Core typecheck/build.
- Root: **241 tests / 40 files**. Catalog coverage and interpolation fields,
  literal unknown data and Tashkent date boundaries are checked.
- Disposable Core: **298 tests / 59 files**, followed by **5 connected
  housekeeping groups** with actual password authentication and database writes.
- Core network gate: **126 files**, no findings; mail acceptance **15 passed**.
- `test:legacy-staff`: **7 browser groups** on both web and Android asset builds.
  Sixteen sections × three languages × four widths, six demo roles, mobile
  navigation/sheets, inbox tabs, form/pref preservation, populated finance and
  canonical large-money analytics fixtures, untranslated guest/task data and
  unchanged mutation payloads. Legacy live API responses are **fixtures**.
- Guest proof: **7 groups** on web and Android assets. Owner/housekeeper offline
  UI proofs pass; these remain distinct from the connected housekeeper proof.
- Persistent front-desk auth: **13 groups / 32 HTTP calls**. Locale: **8 groups**;
  booking/auth browser: reload, gateway restart, logout and four widths pass.
  These recheck the shared provider/header changes against the existing Core.
- Fresh unsigned Android package: minSdk 26, targetSdk 35, wrapper
  `0.7.38-review` / 738001; all **9 assets** match the Android build, compiled
  manifest and zip alignment verified. Final dirty-source artifact size 603682
  bytes; SHA-256 `1dbd48c3746fc95a164eee88d860bda8afa066c257e65e575802609700c44a99`.
  It is **unsigned and not installable**, not a new published APK. The permanent
  key, physical-device/update and connected HTTPS proofs remain outstanding.

`test:legacy-staff` is now part of `cloud:verify`. Connected housekeeping remains
an explicit bounded command because its fixed ports conflict with the running
persistent rehearsal. The full aggregate `cloud:verify` was not rerun as one job.

## Next dependencies

The first real property's name/city, room categories/codes/counts, tariffs and
cancellation terms were requested from the owner; another chat's specifications
are not available here. Real business data, multi-category editing/sales
activation, privileged identity/MFA and real staff rollout remain open. Regional
vault/retention/registration contracts and payment/fiscal provider acceptance are
also outstanding. No hosting/domain/permanent signing key is available yet per
the owner's prior answer. Main, external email, public deployment, money and new
APK publication remain untouched. Native-speaker/screen-reader review is still
needed; catalog coverage does not establish that acceptance.
