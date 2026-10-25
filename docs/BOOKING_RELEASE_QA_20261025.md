# B2 independent browser acceptance evidence

Runtime source: `886623ae7b24b0cf45e45f601430015fd06df527`. Isolated QA branch: `stage7/booking-release-qa-20261025`.

Command (normal build only):

```sh
VIEWS_JOURNEY_DIST=/workspace/views-roadmap-booking-release/dist node scripts/booking-release-recovery.browser.cjs
```

The frozen worker candidate reports dirty `e058f84c7d1114553778a75d46a8fe8d8ce6144d` in release.json; the worker confirmed runtime matches committed B2 source. This is candidate evidence, not final integrated clean-SHA, deployed-web, or APK evidence. The test also supports `VIEWS_JOURNEY_SOURCE` and `VIEWS_BROWSER_EXECUTABLE`, with Playwright default Chromium when a system Chromium is absent.

## Assertions

EN/RU/UZ run independently with actual browser IndexedDB and synthetic HTTP fixtures:

- Release journal is present before initial POST. A same-frame double click sends one initial command.
- Lost response survives reload and a second page; neither reload nor opening the second page sends a command automatically.
- Recovery repeats the immutable reservation ID and idempotency key with `recoveryOnly:true`.
- 403, ordinary 409 and a receipt for another reservation preserve the journal and expose no successful receipt.
- A different authoritative actor scope neither displays nor deletes the previous actor's intent.
- Validated release receipt clears the journal even when subsequent workspace refresh fails; refresh failure remains separately visible.
- Current confirmed reservation and expired hold are accepted as explicit `not_applied` results, without asserting availability or generating a financial operation.
- An existing hold-creation intent inserted after a stale page loaded prevents release dispatch, is preserved, and is displayed for reconciliation.
- IndexedDB quota failure prevents dispatch. Corrupt release bytes remain untouched and disable mutation.
- 360/1440 widths, both themes; zero page errors and unexpected network requests.

No real reservation is released, no payment/provider integration is exercised, and no live database is used. A seeded cross-intent checks UI/storage integration but is not a simultaneous multi-process database race proof. Backend command locking, tombstones, session revocation and release-versus-confirm concurrency require the separate Core proof. Final release owner must rerun this script against the final integrated normal build.

## Canva mapping limitations

Related contracts: CG-BK-008 expiry; CG-BK-010 unknown same key; CG-BK-017 corrupt/offline; CS-FO-004 successful write with refresh failure; CA-CR-006 scope; CA-CR-009 read after write. This browser evidence establishes behavior only, not visual parity or acceptance of those layouts. CH-OP-006 and CA-CR-012 belong to owner-calendar and queue evidence respectively; they are not covered by B2.
