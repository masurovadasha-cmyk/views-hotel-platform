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
npm run build:pages
node scripts/android-review-web-proof.cjs
python3 scripts/build-android-review.py
```

The browser proof intercepts the reserved HTTPS asset origin and serves the same
built dist files. It checks rendered demo mode and refuses external requests.
It is not a native WebView, emulator, installation or physical-device test.
After packaging, restore `npm run build` for the existing root-mounted local
server. Generated review-output is ignored by Git.

In this cloud session the native build stops with an explicit prerequisite error:
Android SDK is absent and javac is unavailable. No new APK, signature verification,
Android runtime acceptance or connected mobile release is claimed.

The four demo listing photos still reference an external CDN. The offline shell
blocks them; listing text and controls render, but those photos are unavailable.
Bundling licensed photo assets remains a mobile-readiness task.
