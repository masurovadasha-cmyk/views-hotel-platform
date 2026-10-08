# VIEWS — current delivery status, 8 October 2026 (Tashkent)

This is the current map of the whole delivery sequence. It supersedes old WIP
labels in the historical handoff, but does not turn local proofs into production
acceptance. Source repository and branch remain unchanged; main is not merged.

| Block | What works / exists | What is still not complete |
| --- | --- | --- |
| Core environment | PostgreSQL 16, restricted runtime, immutable migration ledger, repeatable cloud startup; dedicated local server opens connected staff workspace by default | Persistent public host, named HTTPS endpoint, HA/failover |
| Staff identity | Invitation/password login, sessions/CSRF, scoped staff, password reset/change, local email verification, passkeys/recovery | Real mail delivery, approved public HTTPS and privileged production MFA |
| Booking | PostgreSQL quote/hold/release; synthetic confirmed stay transitions with inventory, audit/outbox and retries | Real inventory/tariff onboarding and paid-stay operational integration |
| Guests | Versioned synthetic primary guest entry/replacement; related-document edits blocked; guest preview RU/UZ/EN, working navigation/favorites/help and corrected legacy booking details | Real PII onboarding, policy-approved data collection and retention |
| Documents | Encrypted fixed synthetic text, scoped noncached preview, expiring session-bound review receipt, accept/reject, audit and replay checks | Selected regional vault adapter, arbitrary real uploads, content inspection, KMS/rotation, approved human review rules |
| Stay and turnover | Synthetic check-in/out; checkout creates pending turnover; dedicated front-desk queue with search/sort/partial-result warning and keyboard confirmation; next check-in blocked until explicit readiness confirmation; separate gated housekeeper self-claim/release/complete with actual password/Core/browser proof in a disposable DB | Actual staff onboarding, reassignment policy and real-room operational acceptance |
| Payments/fiscalization | Provider-bound transport/audit and Payme sandbox/Core tests from preceding stages | Provider credentials/certification, real transactions and fiscal operator integration |
| Government registration | Existing contracts/policy/test provider | Approved real registration adapter/account and current operational/legal rules |
| Recovery | Disposable mail/auth restore; full local snapshot restored and table digests matched, encrypted files decrypted with separate key | Production recovery, KMS recovery and restored deployment credentials/runbook exercise |
| Tenant/owner onboarding | Default-off owner/manager creation and aggregate editing: up to 20 categories/100 rooms, occupancy, independent rates/cancellation, conflict detection, atomic audit/outbox and retries; isolated Core/UI proofs | Verified business data, privileged login/MFA proof, operational inventory editing and sales activation |
| RU/UZ/EN, accessibility | Connected staff/owner/housekeeper (341 entries), guest/public entry (223) and legacy CRM (547) in RU/UZ/EN; separate preferences, keyboard dialogs, mobile role navigation and three languages at four widths | Native-speaker review, full screen-reader/product accessibility acceptance |
| Android | Shared-web WebView wrapper; refreshed unsigned package includes current RU/UZ/EN assets, native compilation/manifest/alignment and all 9 bundled assets verified | Android 10/15 install attempted; WebView syntax fixed and crash recovery added, native UI acceptance remains blocked in software emulation. Existing-key signing helper passes 10 disposable checks; permanent key, update, physical-device and connected HTTPS proof remain |
| Deployment/CI | Git branch push and local builds/tests | Public GitHub checks read at 6ce5fcc: verify and both mail jobs succeeded; Workers Builds failed. Cloudflare build log access and successful deployment remain unverified |
| Production release | No activation performed | Explicit owner approval plus preceding operational/provider/legal/device acceptance |

## Current active local chain

Staff login → reception → synthetic guest → encrypted synthetic file preview →
explicit review decision → synthetic check-in → checkout → pending turnover →
explicit readiness confirmation. Each write is scoped and audited; inventory,
command and outbox effects are transactional. The proof also exercises refusal,
replay, rollback and reload/restart behavior. A positive synthetic review is not
identity certification, and a turnover confirmation is not proof of physical work.

## Next implementation dependencies

1. Real guest/document/registration work needs a selected storage/provider
   contract, regional/key/retention decisions and securely configured access.
   Existing runtime has no registered real document vault or registration adapter.
2. Paid-stay activation needs provider-approved sandbox onboarding and acceptance;
   no test payment is to be relabeled as a real settlement.
3. Real owner/inventory onboarding requires owner-provided verified business data.
4. Legacy staff/demo localization is implemented. The synthetic housekeeper
   journey now has an actual password/Core/browser proof in a disposable DB.
   Multi-category draft editing is implemented and verified without hosting. Owner
   privileged login, real role onboarding and operational inventory editing remain open; native-speaker acceptance is not claimed.
5. Android wrapper/build and existing-key signing tooling are present. The owner
   confirmed no permanent signing key, host or domain yet (7 October 2026). Real
   device/update acceptance and secure key configuration remain required.
6. Public hosting, external email, real payments, recurring services, main merge
   and production remain explicit activation gates from AGENTS.md.

Do not request secret values in chat. Reuse existing secure environment bindings
where applicable and request only missing provider-specific requirements after
checking them. Available Git transport authentication is already sufficient for
this branch; no replacement GitHub token is requested.

See STAGE7_INVENTORY_EDITING.md for the latest checks.
STAGE7_LEGACY_CRM_AND_CONNECTED_HOUSEKEEPING.md records the preceding increment.
STAGE7_OWNER_AND_HOUSEKEEPING.md records the initial gated role implementations.
STAGE7_GUEST_LOCALIZATION.md records guest/public-entry localization.
STAGE7_STAFF_LOCALIZATION.md records connected staff translations.
STAGE7_TURNOVER_WORKSPACE.md records the front-desk turnover queue.
STAGE7_ANDROID_SIGNING_AND_DELIVERY.md records signing configuration and native
emulator failure boundaries.
