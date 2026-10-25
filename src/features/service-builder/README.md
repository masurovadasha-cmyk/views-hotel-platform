# A1: local service draft (SA-GN-001 / 002 / 009, partial)

Reference: the bundled `public/design-140/SA-GN-001-light.webp`, `SA-GN-002-light.webp`, and `SA-GN-009-light.webp` were inspected before implementation. This slice implements service names/code/category, bounded form fields and a guest-form dry run. It deliberately does not implement the reference's publish button, price, routing/SLA, attachment upload, staff checklist or changes to real orders. Those reference IDs remain **partial**, not fully delivered.

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
