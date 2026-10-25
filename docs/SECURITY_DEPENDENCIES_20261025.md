# Dependency review — 25 October 2026

Reviewed baseline: `20decdfff77b2fb59e73496e6e374d1e42e7638b`.
This change fixes newly published, patchable dependencies without changing the
Expo SDK, runtime roles, credentials, network policy or signing identity.

## Current advisory status

| Dependency | Baseline path/version | Resolution |
| --- | --- | --- |
| body-parser | `apps__api>express>body-parser`, 2.3.0 | Scoped Express 5.2.1 override to official 2.4.0; no Express major upgrade |
| multer | `apps__api>@nestjs/platform-express>multer`, 2.4.0 | Scoped Nest platform 11.2.7 override to official 2.5.0 |
| nodemailer | `apps__api>nodemailer`, 10.0.15 | Direct minor update to 10.1.4, covering three address-parser advisories |
| zod | `apps__mobile>expo>@expo/cli>zod`, 3.25.76 | Override restricted to CLI 57.0.28, using official patched 4.6.6 after actual consumer compatibility tests |
| node-forge | `apps__mobile>expo>@expo/cli>node-forge`, 1.4.0 | **Still unpatched.** Existing reviewed-path exception and original 15 November expiry unchanged |
| braces | Historical Metro glob tooling, 3.0.3 | Advisory withdrawn on 23 October; package unchanged, obsolete exception removed. **Withdrawal is not a patch** |

Fresh production dependency audit before this change: 4 high / 3 moderate /
0 critical advisories. After the update: 1 high / 0 moderate / 0 critical,
namely the existing node-forge advisory. No new exception or expiry extension
was introduced. If the withdrawn braces advisory returns, the gate rejects it
until independently reviewed.

## Zod compatibility boundary

Registry inspection found that even latest Expo 58.0.19 / CLI 58.1.15 still
declares Zod 3.25.76. A blind Expo upgrade therefore does not resolve this gate.
The pinned CLI 57.0.28 has two direct Zod consumers:
`DevToolsPlugin.schema.js` and `createMCPDevToolsExtensionSchema.js`.
Tests load those actual modules and the actual `addMcpCapabilities` registration:
plugin metadata, text/audio/image result validation, strict typed command input,
CLI-only command exclusion, enum and invalid-type rejection all pass with 4.6.6.
Full workspace build, including Expo Android export, also passes.

The upstream Zod patch applies declared upper collection bounds before parsing
elements; it does not impose a limit on every unbounded schema. The regression
uses `.max(4)` and oversized invalid input, matching upstream patch a0ebf97.
It fails against 3.25.76 (20,001 issues) and passes with 4.6.6 (one size issue).
This is a narrowly scoped compatibility override, not a claim that arbitrary
Zod 3 consumers can be upgraded without review.

## Exposure and remaining risk

body-parser is an API HTTP parsing dependency and warrants an actual runtime
fix. Multer is shipped through Nest's platform adapter; no application
FileInterceptor or async fileFilter use was found in the current API source,
but the vulnerable library is still upgraded. Nodemailer is used by the
isolated mail worker; tests use loopback capture only, not external delivery.

Forge is used by Expo CLI iOS certificate tooling and
`@expo/code-signing-certificates` for development/update certificate checks.
It is not imported by the VIEWS Core or browser application source. The review
APK uses Android `apksigner`, not Forge. These boundaries reduce this release's
exposure; they do not repair RSA signature validation or make the library safe
for hostile certificate/signature inputs. Reassess before adding such inputs
or enabling a different Expo signing/update workflow.

Expo remains 57.0.27. The complete existing Expo `template.tgz` SHA-256 is
unchanged: `a0ce3367faa0029d374a268e6856be4bdec103b0a4031f8172879fd254def44c`.
No key was generated, extracted or changed by this dependency review.

## Validation

- Frozen-lockfile install; only four targeted dependency upgrades plus
  body-parser's qs patch dependency changed.
- `node --test scripts/pnpm-audit-gate.compatibility.cjs scripts/pnpm-audit-gate.policy.cjs`:
  8 passed, including actual Expo schemas, constrained Zod rejection, gzip
  parsing, Nodemailer envelope, late Multer teardown callback and fail-closed
  exception path/expiry tests. The Zod and Multer regressions fail on baseline.
- Existing staff-mail and mobile dependency acceptance tests passed.
- Full aggregate: 12/12 tasks, including root tests, API/web/CRM builds,
  typechecks and Expo Android export.
- Disposable Core: 767 tests, 14 cancellation and 14 hold authorization races,
  HTTP laundry and loopback guest email/SMTP proof passed. No live DB or external
  mail was accessed.
- Root integration must run these new acceptance scripts in final CI as well
  as its ordinary aggregate, browser and APK checks.

## Primary sources

- [Forge advisory, still no patched version](https://github.com/advisories/GHSA-86w9-cpqp-85rv)
- [Braces advisory withdrawal](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
- [Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), [actual bounded-collection patch](https://github.com/colinhacks/zod/commit/a0ebf97)
- [body-parser advisory](https://github.com/advisories/GHSA-27r3-jxmh-p828)
- [Multer advisory](https://github.com/advisories/GHSA-q7qp-rjg7-q26m), [teardown fix and upstream regression](https://github.com/expressjs/multer/commit/80a2d9d)
- Nodemailer: [nested comments](https://github.com/advisories/GHSA-8c8m-p3m8-cjg8), [group termination](https://github.com/advisories/GHSA-m943-m63m-w62w), [angle-address parsing](https://github.com/advisories/GHSA-85x2-q946-cp5h)
