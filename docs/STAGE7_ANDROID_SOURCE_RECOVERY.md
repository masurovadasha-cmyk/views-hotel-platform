# Stage 7.39 — Android review source recovery

Recovered the manifest, launcher icon, Java WebView shell and packaging helper
from this repository's review commit 02a6322d66d257bf7220b36fde6b2715405e7884.
The publishing workflow was not restored: this increment does not publish an APK
or change Pages. The shell explicitly selects `?api=demo`; otherwise the current
frontend selects live API at the reserved Android asset origin. Nonlocal WebView
resource requests are denied. User-confirmed external HTTPS navigation opens the
system browser. No JavaScript bridge, cleartext or file access is enabled.

The helper now produces only VIEWS-Review-unsigned.apk (0.7.38-review, 738001).
It never generates or replaces signing keys. Unsigned output is not installable.
A separately approved persistent signing identity and upgrade compatibility proof
are required before a new installable release. The current connected loopback
Core cannot be reached from a physical phone via that phone's localhost.

## Reproduce

Use existing checkout; install JDK with javac, Android platform 35, build-tools
35.0.0 and command-line tools via the official Android tooling, then set
ANDROID_HOME or ANDROID_SDK_ROOT. Do not copy secrets into this repository.

```
npm run build:android
node scripts/android-review-web-proof.cjs
python3 scripts/build-android-review.py
```

The browser proof intercepts the reserved HTTPS asset origin and serves the same
built dist files. It checks rendered demo mode and refuses external requests.
It is not a native WebView, emulator, installation or physical-device test.
After packaging, restore `npm run build` for the existing root-mounted local
server. Generated review-output is ignored by Git.

The initial SDK/javac blocker was resolved in Stage 7.40. Toolchain installation
and native packaging now pass in this cloud session. No signed APK, Android
runtime acceptance or connected mobile release is claimed.

## Verified Linux x64 setup (Stage 7.40)

Python 3.12+ runs `python3 scripts/setup-android-review.py`. This installs only in
`/workspace/android-tools` (override with VIEWS_ANDROID_TOOLS). Pinned downloads
and SHA-256 values are recorded in toolchain-linux-x64.json; original archives
were checked against Google repository metadata and Adoptium package checksums.
Checksum mismatches stop installation. Existing archives are checked on every run.
The helper was rerun successfully using the cached, verified downloads.

```
export JAVA_HOME=/workspace/android-tools/java/jdk-21.0.12.1+1
export ANDROID_HOME=/workspace/android-tools/sdk
export PATH="$JAVA_HOME/bin:$PATH"
npm run build:android
node scripts/android-review-web-proof.cjs
python3 scripts/build-android-review.py
npm run build
```

Native Java compilation, DEX conversion, resource packaging, zip alignment and
compiled manifest inspection passed. Every embedded dist file is compared byte
for byte. Packaging refuses an ordinary root-mounted web build, since it would
break the Android asset prefix. Build evidence records source SHA/dirty flag,
asset count, artifact size and SHA-256. This is unsigned review mode, without
public backend, signature, emulator, installation or upgrade proof. Existing
review APK/signing keys and public deployment are not changed.

Stage 7.41 bundles the four existing demo listing photos with the shared frontend.
Original source URLs, byte counts and SHA-256 values are recorded in
src/assets/demo/sources.json. No new photo content or real inventory is introduced.
Vite generates base-aware asset paths for both root web and Android/Pages builds.
The browser proof now requires all four listing images and the detail image to
decode, including after reload, and rejects every external request (zero allowed).
It exercises widths 360/390/768/1440. Native packaging verifies all nine embedded
web files, including the four photos and compatibility marker. This remains a demo and does not establish
native-device execution or real inventory onboarding.

Stage 7.42 adds build:android targeting WebView 74 and checks its marker before
packaging. Native install/launch was exercised, but software graphics prevented UI
acceptance. See STAGE7_ANDROID_WEBVIEW_COMPATIBILITY.md for the failed/partial
evidence; this supersedes the earlier statement that no emulator run occurred.
