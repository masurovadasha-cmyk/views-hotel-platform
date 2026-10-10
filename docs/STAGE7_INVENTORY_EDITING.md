# Stage 7.51 — edit draft inventory without public hosting

Completed 8 October 2026 (Tashkent), on dirty source based on
`a4e1f36ca764a86538c8730b059561f860954297`.

## Delivered behavior

Create the initial property using the existing form, then choose **Edit inventory**
from its draft row. The editor loads the saved property and supports:

- Up to 20 categories and 100 rooms total, at least one room per category.
- Property name, city/address, category names and occupancy from 1 to 20 guests.
- Adding/removing draft categories and rooms, renaming room codes while retaining
  room IDs; the Core also supports moving an existing room between categories.
- Independent UZS nightly prices with exact minor units, one base rate per
  category; free cancellation from 1 to 720 hours before arrival, 0% afterwards.
- RU/UZ/EN, responsive controls, preserved forms when switching language, explicit
  discard confirmation and reload. The staff catalog now has 341 entries.

The original one-category creation endpoint remains compatible. New
`GET /v1/owner-inventory/:propertyId` and `POST /v1/owner-inventory/:propertyId`
are exposed through the same scoped local gateway. The GET response includes a
SHA-256 revision over the stored aggregate. POST requires that revision and a
UUID idempotency key. Null category/room IDs create records; existing IDs must
belong to the selected property. Omitted draft rows are removed within the same
transaction. IDs, authority fields, duplicate category names/codes and limits are
validated server-side. Category and room ordering is canonicalized for retries.

The transaction locks the existing owner/manager authority, property, categories,
rooms, rates and policies. A competing edit gets `INVENTORY_REVISION_CONFLICT`,
not a silent overwrite. Mutation, before/after audit and outbox are atomic. A
committed response lost in transit is retried using the same frozen body/key;
replay returns the original result, then the UI reloads current server data.
Changing a cancellation window creates a new inactive policy, preserving the old
one rather than modifying a potentially referenced policy.

Only managed drafts originating from the previous owner creation flow are
editable. Active properties/rooms/rates/policies, operational reservations,
quotes/inventory periods, shared policies and separately configured seasonal,
weekday or adjustment pricing are refused. This protects operational records and
prevents cascading deletion of independent pricing rules. Property and room
statuses remain draft; rates/policies remain inactive and quotes remain refused.
Foreign-key/uniqueness refusals roll back and become a known noneditable result.

## Executed verification

All final checks exited 0:

| Check | Result |
| --- | --- |
| Root typecheck/web build | Passed |
| Root `npm test` | 242 tests / 40 files |
| Core typecheck/build | Passed |
| `npm run cloud:test:core` | 310 tests / 61 files in owned disposable PostgreSQL 16 |
| Focused `npx vitest run src/staff-auth` in apps/api | 23 tests / 3 files |
| Core network primitive gate | 128 files; no findings |
| Mail acceptance | 15 passed |
| `npm run test:workspaces` | Owner creation, new editor and housekeeper browser proofs passed |
| New editor proof on web and Android-target assets | Six groups each; RU/UZ/EN × 360/390/768/1440 pixels |
| Android frontend build | Passed; browser proof uses prefixed Android assets, no device claim |
| Persistent runtime stop/start | Ready; 49 migrations, zero new |
| Persistent front-desk HTTP auth proof | 13 groups / 32 requests |
| Existing booking browser proof | Login, quote/hold/release, reload, gateway restart, logout and four widths passed |

New PostgreSQL tests cover independent category rates/cancellation, exact money,
ID-preserving code swaps and moves, category/room removal, simultaneous retries,
competing revisions, cross-property IDs, denied roles, inactive/operational
boundaries, preservation of seasonal rules, rollback on audit failure and flags.
The browser proves committed-response loss/retry, duplicate-code rejection before
submission, stale form preservation until explicit reload, persisted edits after
reload, removal and failed-load retry. Browser owner identities/responses are
synthetic HTTP fixtures; the database tests use actual Core services and scoped
PostgreSQL. They do not establish privileged owner login acceptance.

An initial Android browser attempt used the web asset path and timed out. The
fixture server now handles the Android base path and the full proof passed.
No application workaround or disabled assertion was used.

Repeat the editor acceptance after `npm run build` with:

```sh
node scripts/owner-inventory-edit.browser.cjs
npm run build:android
VIEWS_BROWSER_DIST=dist-android node scripts/owner-inventory-edit.browser.cjs
```

`test:workspaces` (already included in `cloud:verify`) now includes the editor.
No dependencies, migrations or launcher flags changed; no new onboarding config
draft is needed. Existing account/role activation is unchanged. No host/domain,
external email, public tunnel, real payment, main merge or APK publication is
needed or performed. No new native APK was built in this block.

## Remaining outside this block

Normal startup keeps the owner feature off. Privileged owner login/MFA and real
staff rollout remain separate prerequisites; no identity was promoted for this
work. Actual property data, sales activation, seasonal pricing UI, operational
inventory editing and real provider acceptance remain separate work. The local
draft editor does not certify real inventory or open it for booking.
