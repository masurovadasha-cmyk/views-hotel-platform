# Stage 7.45 — RU / UZ / EN for the local staff workspace

The connected local staff workspace now has a language selector and 264 source
messages with English and Latin-script Uzbek translations. This covers invitation
and recovery entry, sign-in/account controls, passkeys/recovery codes, reception,
guest editing, document status/preview/review controls, booking and turnover.
Accessible labels, blocking reasons, warnings and stored notices/errors translate
with the selected language. The shared header identifies the active language for
assistive technology; fixed English brand text retains an English language tag.

Only the language preference is saved in browser localStorage. Unsupported values
fall back to Russian. If storage is blocked, switching still works in memory.
Switching does not remount forms, clear entered data, refresh sensitive previews,
reset idempotency keys or submit commands. Passwords, invitation tokens, document
content and recovery codes are not added to browser storage by localization.

Dates use the selected locale while keeping the operational timezone. Money is
formatted from bigint minor units without a Number conversion. Interpolated values
remain React text; the translator does not parse HTML or recursively interpolate.
Server property/rate names prefer the requested language when supplied, falling
back to an available server name. Guest names and document content are unchanged.

## Reproduce

With the existing local runtime and root web build:

```
npm run build
npm test
npm run cloud:test:auth
npm run cloud:test:locale
```

The locale browser proof creates new synthetic stays and uses only the generated
synthetic staff fixture. It does not modify existing user accounts. Its report is
private local evidence/stage745-locale.json with exact sourceCommit/sourceDirty.

Run cloud:test:auth before another pair of browser suites. The authentication proof
already uses six login attempts, while the account limit is eight per five minutes.
Running three additional browser suites with that same identity exceeds the limit.
Do not weaken that control. cloud:verify now prepares a fresh synthetic identity
before the locale proof; the existing browser proof reports a failed login HTTP
status immediately instead of waiting for an absent booking form.

## Evidence

Dirty continuation of 44782b5f74944f4cfc6fadc6c9f1a58d7db608c0, exit 0:

- Web typecheck/build; root 228 tests / 37 files. Six new tests cover catalog/source
  coverage, interpolation fields, safe interpolation, preference validation,
  exact large/fractional money and server-name selection/fallback.
- Core typecheck/build; staff-auth 20 tests / 3 files; network gate 119 files with
  no findings; mail acceptance 15 tests.
- Staff HTTP proof: 13 groups / 32 calls.
- Locale browser proof: eight groups, including preserved login/guest/quote state,
  one check-in/out/cleaning command each across languages, modal cancellation,
  unchanged preview text/no refetch, persisted preference, translated notices,
  blocked storage, and three languages at 360/390/768/1440 widths.
- Existing Russian stay proof: 16 groups; existing booking/navigation/restart and
  logout browser proof: four widths; no page errors in successful runs.
- Disposable mail/passkey proof: 47 groups / 60 HTTP calls, 17 loopback SMTP
  captures, restore of 70 tables including seven private tables/eight recovery
  rows. Persistent runtime stopped only for occupied fixture ports and restarted
  afterward, retaining its database and all 47 migrations.
- Android-target frontend build and asset-origin browser regression: four loaded
  offline photos, guest/staff navigation, SMS warning/focus, reload and four widths;
  no external requests or page errors. This is not native device acceptance.

An initial test used Node-only imports in the frontend typecheck; the source
coverage check now uses Vite raw imports with its proper type declaration. A
browser run against the older build consequently failed; rebuilding and rerunning
passed. A later third browser login exceeded the shared synthetic fixture's login
budget; a fresh fixture passed and the aggregate command now accounts for this.
The updated aggregate cloud:verify command has not been rerun in full for this UI
increment; the individual checks above were executed. Final clean-source browser
reports identify the committed SHA separately.

## Boundaries

This closes localization of the existing connected local staff screens, not every
VIEWS product surface. Guest/demo and future owner/cleaner workflows still need
complete localization. Native-speaker review of English/Uzbek copy and broader
screen-reader acceptance remain release work. No owner/cleaner privileges,
external providers, production deployment or signed APK release were enabled.
