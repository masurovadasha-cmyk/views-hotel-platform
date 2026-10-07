# VIEWS — current delivery status, 7 October 2026

This is the current map of the whole delivery sequence. It supersedes old WIP
labels in the historical handoff, but does not turn local proofs into production
acceptance. Source repository and branch remain unchanged; main is not merged.

| Block | What works / exists | What is still not complete |
| --- | --- | --- |
| Core environment | PostgreSQL 16, restricted runtime, immutable migration ledger, repeatable cloud startup; dedicated local server opens connected staff workspace by default | Persistent public host, named HTTPS endpoint, HA/failover |
| Staff identity | Invitation/password login, sessions/CSRF, scoped staff, password reset/change, local email verification, passkeys/recovery | Real mail delivery, approved public HTTPS and privileged production MFA |
| Booking | PostgreSQL quote/hold/release; synthetic confirmed stay transitions with inventory, audit/outbox and retries | Real inventory/tariff onboarding and paid-stay operational integration |
| Guests | Versioned synthetic primary guest entry/replacement; related-document edits blocked | Real PII onboarding, policy-approved data collection and retention |
| Documents | Encrypted fixed synthetic text, scoped noncached preview, expiring session-bound review receipt, accept/reject, audit and replay checks | Selected regional vault adapter, arbitrary real uploads, content inspection, KMS/rotation, approved human review rules |
| Stay and turnover | Synthetic check-in/out; checkout creates pending turnover; next check-in blocked until explicit readiness confirmation | Actual housekeeper workspace and staff assignment; no new housekeeper privileges granted |
| Payments/fiscalization | Provider-bound transport/audit and Payme sandbox/Core tests from preceding stages | Provider credentials/certification, real transactions and fiscal operator integration |
| Government registration | Existing contracts/policy/test provider | Approved real registration adapter/account and current operational/legal rules |
| Recovery | Disposable mail/auth restore; full local snapshot restored and table digests matched, encrypted files decrypted with separate key | Production recovery, KMS recovery and restored deployment credentials/runbook exercise |
| Tenant/owner onboarding | Existing model/RLS and property scoping | Verified real inventory/owner data and end-to-end onboarding UI against Core |
| RU/UZ/EN, accessibility | RU local staff journey, four tested widths, timezone handling | Complete three-language catalog, full keyboard/screen-reader and product-wide accessibility acceptance |
| Android | Historical shared-web review wrapper described in handoff | Historical native WebView source and unsigned packaging helper restored from review tag; SDK/JDK compiler, stable signing store, install/update and physical-device proof absent |
| Deployment/CI | Git branch push and local builds/tests | GitHub REST read unavailable in this session; hosted check state not independently established. Historical Cloudflare failure is not declared fixed |
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
4. Localization and the real housekeeping/owner interfaces remain software work;
   they are not marked complete or mislabeled as external-credential blockers.
5. Android release needs the actual wrapper/build source and approved persistent
   signing setup. A new temporary APK would not close the update-path requirement.
6. Public hosting, external email, real payments, recurring services, main merge
   and production remain explicit activation gates from AGENTS.md.

Do not request secret values in chat. Reuse existing secure environment bindings
where applicable and request only missing provider-specific requirements after
checking them. Available Git transport authentication is already sufficient for
this branch; no replacement GitHub token is requested.
