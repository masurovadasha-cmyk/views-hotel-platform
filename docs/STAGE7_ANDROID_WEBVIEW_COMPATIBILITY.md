# Stage 7.42 — native WebView compatibility

A real native test on Android 10 (API 29), AOSP WebView 74.0.3729.185,
found `Uncaught SyntaxError: Unexpected token ?` in the previous web bundle.
The banner appeared but the application did not execute. Browser tests against
modern Chromium had not detected this compatibility defect.

`npm run build:android` now uses Vite's chrome74 target and emits an explicit
compatibility marker. The APK packager rejects an ordinary Pages/root build
without that marker. The shared GuestApp and demo StaffApp replace literal
underscore/hyphen occurrences with global regular expressions, avoiding
String.replaceAll, which is unavailable in WebView 74. Live server workflows
are not newly enabled or certified for this old engine.

The browser regression removes String.replaceAll before app startup, checks
listing/detail images, reload, four widths, and guest → staff → guest navigation
with no external requests. APK comparison includes all nine bundled files.

## Native evidence and limits

- Original unsigned source: cb29adc9dfed580f0414fb4e07fa0fa0e30d46f6.
- Android emulator 37.2.12, Android 10 x86_64, software CPU emulation (no /dev/kvm).
- SDK archives were checked against upstream checksums; pinned SHA-256 download
  records are in apps/android-review/emulator-linux-x64.json.
- Install succeeded using a separate temporary emulator-only signing key. No
  published package or release signing identity was changed.
- Before fix: blank WebView and the JavaScript syntax error above.
- After fix: native launch returned `Status: ok`, `LaunchState: COLD`; the syntax
  error was absent. However, text rendering failed with `Invalid font buffer`
  and raster serialization errors in this software graphics environment.
- Disabling GPU caused GL initialization failure; disabling GPU rasterization
  still did not produce a usable interface. Native UI acceptance remains FAILED/
  INCOMPLETE, not a successful device test. Initial system UI ANR also occurred.
- Browser regression, root tests and packaging pass independently. No physical
  phone, in-place signed update, persistent key or connected backend is proven.

## Reproducing the environment

`python3 scripts/setup-android-review.py --with-emulator` adds pinned emulator,
platform-tools and an Android 10 test image (about 1 GiB downloads). Default setup
still installs build tools only. Python 3.12+, Linux x64 and workspace disk space
are required. Stop owned SDK processes before replacing installed tools.

Use an isolated AVD with ANDROID_AVD_HOME and ANDROID_EMULATOR_HOME under
/workspace/android-tools. Test options were `-no-window -no-audio -no-boot-anim
-no-snapshot -accel off -gpu swiftshader_indirect -cores 2 -memory 2048 -port 5580`.
AVD resolution: 480x800, density 160; image: android-29/default/x86_64.
No existing AVD or user's Android device is used.

Host ADB could not create its default ~/.android in this restricted workspace.
A disposable postgres:16-bookworm container ran only the mounted adb binary with
host networking, loopback ADB port 5041, read-only SDK/test APK mounts and its own
container home. No PostgreSQL service was started in it and no persistent database
was attached. The owned emulator/container were stopped after diagnosis. Temporary
signing material is not a deliverable and is not stored in Git.

Next native acceptance needs a working Android graphics environment (preferably
hardware-accelerated) and must verify rendered guest/staff screens, photo detail,
back navigation and cold restart. An `am start` success alone is insufficient.

Stage 7.43 repeated native testing with Android 15 / WebView 124. Installation
succeeded, but software emulation still failed to render; recovery UI was added.
See STAGE7_ANDROID_SIGNING_AND_DELIVERY.md. Neither native attempt is a passed
Android UI acceptance result.
