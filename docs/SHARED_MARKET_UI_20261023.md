# Shared guest/staff local demo market

Base: `607dc4862f43e6609746bfe70a83c94b69fcbea9`.

The existing guest demo market and a new explicitly labelled Staff CRM queue use the same `views.demo-market.v1` per-tab state. No orders are copied into legacy service task fixtures or Core. Existing baskets, pending confirmations, replacement drafts and history remain unchanged. The existing quantity ledger accounts for staff cancellation (release) and simulated fulfilment (consumption).

`useDemoMarket` reads on mount and subscribes to same-document successful writes. `commitDemoMarket` notifies only after storage commits; every action reloads and validates current storage first. No BroadcastChannel, cross-tab sharing or backend sync is claimed. The UI continues to work through guest/staff remounts and reloads. A failed read/write fails closed and does not announce success.

Staff queue actions open a confirmation with Back to queue. Role changes unmount this confirmation. The new reducer action rechecks reserved/terminal state and the existing pending/edit lock at confirmation. Same terminal operation replay is safe; conflicting stale operations fail without overwriting current data. Staff cannot finish or discard a guest review or replacement draft. A visible notice directs the user back to the guest market.

Demonstration display policy: general manager, super admin, front desk and concierge can simulate actions; owner is read-only; other roles, including cleaner/technician, have no queue. This is explicitly not authentication or a Core permission grant. The live StaffApp does not expose or mount the queue; local-core and guest-core have separate existing applications. Importing the shared modules does not access demo storage.

UI includes RU/UZ/EN text and retains UZS/no-charge disclosures, existing photos and calendars. Staff's blanket “changes are not saved” notice now distinguishes transient sample tasks from per-tab market history.

Validation: typecheck and review build passed; 32 targeted tests across existing market/catalog and shared-store tests passed. Coverage includes successful-write notifications, failure without notification, unsubscribe, stale action, replay, preserved basket/replacement links, pending/edit locks and demo role display policy. Independent browser QA and full integration CI/APK evidence are recorded by the parent integration release.

Limits: same browser tab only; no real fulfilment, delivery, payment, stock movement, authorization or Core synchronization. No database/migration, credentials, release configuration or external service change.
