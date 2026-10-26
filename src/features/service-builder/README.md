# A1: local service draft (SA-GN-001 / 002 / 009, partial)

Reference: the bundled `public/design-140/SA-GN-001-light.webp`, `SA-GN-002-light.webp`, and `SA-GN-009-light.webp` were inspected before implementation. This slice implements service names/code/category, bounded form fields and a guest-form dry run. It deliberately does not implement the reference's publish button, operational pricing, routing/SLA, attachment upload, staff checklist or changes to real orders. Those reference IDs remain **partial**, not fully delivered.

The entry is in the existing demo Admin panel, never the live Admin panel. A selected demo role is a presentation choice, not authorization. The draft is not a duplicate Core catalog or a write contract to it. No network, auth, order, fee, payment, delivery or notification operation exists here.

## Contract and persistence

One local draft uses dedicated IndexedDB `views-service-draft`, version 1, store `draft`, key `current`. There is no migration from, reset of, or write to any existing demo database. Record: `{format:1, revision, draft:{code,names,category,fields}}`. A missing record reads as revision zero without writing. Stored records require a positive safe integer revision, the exact supported format and bounded structure. Invalid/unknown records block saving and remain untouched.

Names/labels/options have RU/UZ/EN strings up to 100 characters. Code permits up to 32 uppercase Latin letters, digits and hyphens. Categories: cleaning, concierge, maintenance. At most eight fields: text, date, choice, consent. Choice has at most six options. Incomplete drafts may be saved; a successful dry run requires code and names, at least one field, localized labels, and two to six distinct localized choice options. Preview answers are transient, at most 500 text characters, strict Gregorian dates, option indexes or booleans. They never become an order or leave the component. React renders user strings as text; there is no HTML renderer, evaluation or arbitrary executable form definition.

Saving compares the expected revision inside one serialized read/write transaction. Competing tab writes reject stale revisions; the losing editor retains its inputs and must explicitly choose to discard them and reload. Exact repeated saves do not increment revisions. Save success is displayed only after the transaction completes. Storage errors block writes without a destructive reset or false success.

Unsaved edits remain while moving Back/Next within the builder. Cancel offers keep/discard confirmation. Browser page exit receives the standard unsaved-changes warning. Saved drafts survive reload and new tabs. Switching the surrounding section, demo role, guest mode, access screen or design review requires a localized discard confirmation when dirty. Rejecting keeps the mounted editor and inputs; accepting discards only unsaved edits, never the saved revision. Departure is blocked during a storage operation. Browser Back/reload/page exit uses the native beforeunload warning; same-document Back that does not leave the editor preserves its state. The guard unregisters on unmount and does not change real authorization. The preview does not simulate staff authorization.

## Reproduction

From repository root:

- `npm run build:review`
- `npx vitest run src/features/service-builder/model.test.ts`
- `node src/features/service-builder/browser.cjs`
- `node src/features/service-builder/navigation.browser.cjs`

Browser tests use isolated synthetic storage and serve the actual build on loopback, with external/API requests blocked. They cover empty/required fields; text/choice/date/consent; duplicate save; Back; Cancel keep/discard; reload; RU/UZ/EN, both themes, 390/1440 widths; stale tabs; unknown record version; and aborted writes. The navigation proof additionally rejects section/role/guest/access/design departure, cancels an actual cross-document browser Back, and confirms that accepted departure retains the last saved revision. Output and screenshots are local evidence. Integration CI, Android upgrade/restart, design parity and Core permission/catalog contracts require the parent release checks and future slices.


## SA-GN-003 conservative follow-on: unapproved price simulation (candidate)

This candidate adds only a manually entered UZS unit amount multiplied by an
integer sample quantity. It is not approved pricing, a quote, service availability,
an order or payment. Taxes, discounts, commissions, duration and fixed-fee rules
are intentionally not inferred. SA-GN-003 visual/functional acceptance remains
pending; no registry status is promoted by this patch.

Amount is a canonical decimal string in minor units (100 = 1 UZS), matching
`formatStaffMoney` in `../local-core/staff-locale.ts`. Multiplication uses BigInt.
Amount/total maximum is 9223372036854775807; sample quantity is 1–50, matching
the technical safeguards in `../market-core/model.ts`, not establishing a new
business or availability rule. Zero is allowed as an explicitly entered sample,
not a statement that a service is free. No rounding is performed. Quantity and
calculation results are transient, never saved into the draft.

Legacy format-1 drafts read unchanged without writing. An unchanged save retains
the same record format and revision (the existing store still puts that record). An explicit pricing edit saves format 2 with `draft.pricing` set to null or
`{kind:'unit',currency:'UZS',unitMinor:string}`. This is a record format change,
not an IndexedDB database-version change. Format 2 never downgrades to format 1;
old clients reject it instead of dropping the new field. Unknown/malformed
records remain blocked. Existing CAS and transaction-commit success semantics
are retained. Invalid pricing blocks save without reporting a storage failure.
Changing the rule or quantity invalidates the previous simulated total.

Additional candidate checks:

- `npx vitest run src/features/service-builder/model.test.ts src/features/service-builder/pricing.test.ts`
- `npm run build:review`
- `node src/features/service-builder/pricing.browser.cjs`
- existing `browser.cjs` and `navigation.browser.cjs` remain required

Prepared source and tests are not execution evidence. Before acceptance run root
and API required gates, the existing browser chain plus pricing proof, and native
compatibility checks. No new APK, public release or live price activation follows
from this local patch artifact.


## SA-GN-004 candidate: unpublished weekly hours

The demo-only builder now permits explicitly entered weekly windows and a single
synthetic local date/time check. Output says **inside/outside configured draft
hours**, never that a service is available. It is not capacity, a slot, a booking,
a lead-time policy, a deadline, or an order promise. No Core requests, activation,
publication, holidays, notifications, payments or operational calendars change.

No timezone, day or business hours are prefilled. A configured rule requires
1–14 non-overlapping same-day windows, ISO weekday 1–7, whole local minutes,
start-inclusive/end-exclusive. Adjacent windows are allowed; overnight windows
must be explicitly represented as separate day rows. `24:00` is an end boundary
only. Zero windows is incomplete, not a claim of closure. Removing configuration
means not configured, not always open. Supported zones match S1: UTC,
Asia/Tashkent, Europe/Berlin, America/New_York. Sample input is strictly
`YYYY-MM-DDTHH:MM`, years 2000–2099. Real date validation rejects normalization,
seconds, suffixes and offsets. Nonexistent/ambiguous local sample times and that
day's window boundaries fail closed. The pure resolver is adapted from S1; no
SLA API, permission, default hours or runtime simulation is imported. Missing
Intl capabilities produce an explicit device/timezone error.

The synthetic sample and result are transient, never saved and never an order.
Changing configuration/sample or explicitly reloading clears the prior result.
Configuration participates in existing dirty/navigation/cancel guards. Invalid
configuration disables saving without reporting a storage failure.

Formats 1/2 remain byte-compatible on read and no-op save. An explicit
availability edit saves format3, with both `pricing` and `availability` keys;
legacy1 adds `pricing:null`, which means unconfigured, not a free service.
Existing prices remain unchanged. Availability is null or
`{kind:'weekly',timezone,windows:[{day,startMinute,endMinute}]}`. Format3 never
downgrades; old clients reject it rather than silently discard the new field.
No IndexedDB database-version or SQL migration is made. Existing CAS,
transaction-commit success, corrupt-record preservation and quota handling stay.

Additional candidate gates (must execute on the final integrated source):

- `npx vitest run src/features/service-builder/model.test.ts src/features/service-builder/pricing.test.ts src/features/service-builder/availability.test.ts`
- `npm run build:review`
- `node src/features/service-builder/availability.browser.cjs`
- existing builder, pricing and navigation browser proofs, root/API aggregate
  gates and native compatibility checks remain required.

SA-GN-004 acceptance and registry status are not promoted by prepared code or
synthetic unit checks. Browser/Android and full visual acceptance require their
own evidence. No public release or live availability activation follows.
