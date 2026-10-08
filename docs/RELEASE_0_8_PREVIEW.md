# VIEWS 0.8.0-preview — web and Android

Owner requested publication on 2026-10-08. This release updates the public
interface preview, not the production hospitality system. The design reference
is https://chatgpt.com/s/m_6ac7a4fbdb2c819181431bb894e4ca47 (shared image).
Graphite/gold/ivory styling, the existing guest/CRM screens and a new entry
screen are shared by web and Android. The entry provides four directions:
guest, host/owner, employee and platform administration, in RU/UZ/EN.

## Delivery boundary

Public builds use explicit static-demo mode, even when `?api=live` is supplied.
Direction selection changes demonstration screens only and grants no server
permissions. Email sign-in explicitly reports unavailable; it neither sends
mail nor creates an account. Public PostgreSQL Core, secure session origin and
an approved email transport are still required for real sign-in. Existing local
employee authentication remains separate and unchanged.

Cloudflare root configuration now targets the already connected Worker with
static assets. The legacy Pages config is retained in `wrangler.pages.toml`.
The review Worker returns 503 for API routes rather than returning HTML or using
D1 as a substitute for Core. Neither workflow creates/seeds a database.
The legacy Pages email handler also refuses to claim delivery without a
configured transport; synthetic token exposure remains an explicit staging flag.

## Reproduce

Use Node 22, `npm ci`, `npm run typecheck`, `npm test`. Public build commands:

```sh
npm run build:review
node scripts/access-portal.browser.cjs
npm run build:pages -- --outDir dist-pages
VIEWS_ACCESS_BUILD=dist-pages node scripts/access-portal.browser.cjs
npm run build:android
VIEWS_ACCESS_BUILD=dist-android node scripts/access-portal.browser.cjs
node scripts/android-review-web-proof.cjs
```

For Android, `python3 scripts/setup-android-review.py` installs pinned tools;
set JAVA_HOME/PATH to its JDK and ANDROID_HOME to its SDK. Then:

```sh
python3 scripts/build-android-review.py
python3 scripts/android-signing-proof.py
python3 scripts/sign-android-review.py --ack=REVIEW_APK_SIGNING
```

The last command requires a clean matching source build and the five existing
`VIEWS_ANDROID_*` signing inputs described in the signer. Keep all private key
and password files outside the repository with restrictive file permissions.
Retain the preview key for future updates; losing it prevents in-place updates.
Do not reuse a disposable proof key for distribution.

Release identity: `uz.views.preview`, versionCode `800001`, Android 8+. This is
a separate VIEWS Preview application, not an upgrade of `uz.views.review`.
Published APK must be signed, aligned and accompanied by SHA-256 and public
signing evidence. `VIEWS-Review-unsigned.apk` is an intermediate, not a download.
`release.json` embeds the source commit and dirty status in every web build.

## Verification and manual acceptance

Pre-publication modified-tree checks relative to `4a61439`: root 249 tests in
42 files, Core 404 in 73 files, API/root typecheck and builds, network 147 and
mail 15 passed. Portal browser proof covers four directions, three languages,
four widths and unavailable email without network requests; native packaging
verifies compiled manifest and exact bundled assets. Signing guard proof checks
ten failure/success cases with a disposable key. Cloudflare local Worker dry-run
and retained Pages Functions compilation both passed. Remote deployment is only
accepted after checking the published commit; a local dry-run is not deployment.

No DB migration is needed. No real email/payment/inventory activation is included.
Physical-device UI and in-place update acceptance remain unverified. Historical
Android 10/15 software emulators had rendering failures; modern browser tests
are not evidence of native rendering. On a real Android phone check installation,
cold start, four directions, RU/UZ/EN, dark mode, images, back navigation and
offline reopening. No real documents, card numbers or guest data belong in this
preview. Review screen contrast and translations with native speakers.

Main remains unmerged. Publishing uses the existing staging branch and a
prerelease; GitHub Pages and Cloudflare credentials/build status are independent.
