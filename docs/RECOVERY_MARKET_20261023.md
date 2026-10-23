# Durable local demo market recovery

Base: `f75d817aa0c331577374926885371d9c174d79f8`. The previous 0.19 native proof showed that sessionStorage history disappeared on APK process restart/update. This slice addresses future persistence; already lost sessions cannot be reconstructed.

## Storage contract

IndexedDB database `views-demo-market`, version 1, object store `ledger`, key `current` contains `{format:1, revision, raw, legacySources}`. `raw` is the existing validated v1 market JSON, including basket, pending token, edit target, orders, replacement links and quantity accounting. `legacySources` holds original JSON strings. The ledger is read, validated and updated within one readwrite transaction; success is exposed only on transaction completion. Concurrent transactions are serialized and UI mutations require their expected revision. Stale actions are rejected with a refresh, not replayed silently onto new data. Existing idempotent terminal operations remain no-ops when repeated against current state.

The app opens storage lazily only in demo surfaces. A missing ledger imports valid `sessionStorage['views.demo-market.v1']` or initializes a new empty demo if there is no legacy value. It never removes or changes that source. Import failure, malformed records, unsupported versions and inaccessible storage fail closed without presenting an empty successful history.

A different unrecognized legacy source blocks actions. The user can inspect read-only JSON and download both histories, then explicitly retain the device ledger while archiving the old tab copy in the same transaction. No histories are merged. Archived originals remain available as read-only JSON/download links; quota or archive limits preserve both sources and block resolution. Equivalent legacy sources are recorded before later ledger changes so an unchanged source does not become a false conflict. Download support depends on the browser/WebView; readable/selectable JSON is the fallback, with no new native permissions.

Subscriptions refresh mounted views after committed changes; BroadcastChannel informs other tabs and focus/visibility refresh is a fallback. This is one installation/origin, not cloud or device synchronization. Clearing data, uninstalling, browser eviction or a different preview origin can remove/isolate history. Persistence across Android process restart and in-place APK updates must be established by the native release proof; it is not inferred from web tests alone.

## Validation and scope

TypeScript and review build pass. Domain/migration tests cover import preservation, equal-source recognition, explicit conflict archival, malformed/version cases, stale revision rejection, replay, pending/edit/backlink preservation and archive limit failure. Independent browser QA owns real IndexedDB concurrency/abort tests and updated journey scripts. Release CI, preview and Android exact-artifact evidence are recorded by the integrating parent.

No Core/API, live databases, server migrations, authentication, payment, delivery, credentials, native permissions or external services changed. Existing RU/UZ/EN and demo disclosures remain. The StaffApp persistence notice was updated with explicit parent authorization.
