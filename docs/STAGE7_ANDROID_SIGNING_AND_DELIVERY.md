# Stage 7.43 — signing preparation and delivery status

The owner confirmed on 7 October 2026 that hosting, a domain and a permanent
Android signing key are not available yet. No public Core, final release key,
production email, payments or government/storage integrations were activated.
This checkpoint does not close the whole product backlog.

## Existing-key signing

Build an unsigned review package with the verified toolchain:

```
npm run build:android
node scripts/android-review-web-proof.cjs
python3 scripts/build-android-review.py
```

Android output is isolated in dist-android; ordinary web output remains in dist.
Building an APK no longer replaces the running local server assets.

Commit source changes before building a candidate. The signing helper requires
that the exact clean Git SHA matches build-evidence.json and that the unsigned
APK hash, manifest verification and asset verification match. It accepts only
uz.views.review static-demo with real backend/payments disabled.

Secure operator configuration (never provide secret contents in chat or Git):

| Variable | Meaning |
| --- | --- |
| VIEWS_ANDROID_KEYSTORE | Existing keystore file outside the repository |
| VIEWS_ANDROID_KEY_ALIAS | Existing signing alias |
| VIEWS_ANDROID_STORE_PASSWORD_FILE | Private file containing the store password |
| VIEWS_ANDROID_KEY_PASSWORD_FILE | Private file containing the key password |
| VIEWS_ANDROID_CERT_SHA256 | Independently recorded public SHA-256 certificate fingerprint |

On Linux secret files must not be group/world accessible. Android build-tools
35.0.0 and JAVA_HOME/PATH are required. Shared store/key password files are
supported; temporary password copies use distinct paths because apksigner reads
sequential lines when the same file is supplied twice. Copies are private and
removed at command exit. Tool errors expose only the tool name and exit code.

```
python3 scripts/sign-android-review.py --ack=REVIEW_APK_SIGNING
```

The helper never creates a key. It verifies the APK signature and exact pinned
certificate before exposing review-output/VIEWS-Review-candidate.apk. Existing
candidates are not overwritten, including a concurrent creation. Signing evidence
contains public digests and source SHA, never key/password data. It does not
publish, deploy, certify a store release or claim upgrade/device compatibility.

`python3 scripts/android-signing-proof.py` exercises ten positive/negative guards
in a disposable Git fixture with a disposable two-day key. The normal unsigned
APK must exist first. A successful fixture test is not permanent-key acceptance.

## Other fixes and checks

The guest SMS window now states that SMS is unavailable. It collects no code,
claims no delivery/verification, traps focus on its close button, supports Escape
and restores focus to its trigger. Browser proof covers these behaviors.

Android now removes a failed WebView and provides a native retry screen on a
renderer termination or main-frame load failure. Pause/back handlers accept the
resulting null WebView. No automatic retry loop or debugging bridge is enabled.
Java compilation/packaging pass; rendering/retry on a usable device remains open.

## Exact acceptance boundaries

Full clean-source `cloud:verify` passed at
6ce5fcc108d13452d7f84308a8ddabfdfdf12f1f: root 222/36 files, Core 283/56 files,
mail policy 15, staff HTTP 13 groups/32 calls, stay browser 13 groups and booking
browser four widths. Snapshot restore matched 71 tables, 7 private tables,
12 encrypted documents and 5 turnovers without modifying the source DB.

The Android 15 / WebView 124.0.6367.219 attempt used the verified AOSP
x86_64-35_r02.zip image (SHA-256
6dd7de33e63ef105cf2fabea6badda1dbe7665c96d8908e5f6e1407e63ff4556).
Boot took about 429 seconds without KVM; APK installation succeeded, app launch
hit a timeout and the renderer crashed. System UI ANR blocked the recovery-screen
check. No guest/staff native UI acceptance is claimed. The bounded emulator
process and disposable ADB container were stopped; test signing material was
removed. No physical Android test or stable signing/update proof exists yet.

Remaining software work (including full RU/UZ/EN and real owner/housekeeper
interfaces) is explicitly retained in CURRENT_DELIVERY_STATUS.md. It is not
reclassified as a hosting or credential problem.

The separate disposable mail/passkey run passed 47 groups / 60 HTTP calls,
including restore of 70 tables, 7 private tables and 8 recovery rows. Its first
attempt stopped on an occupied port; the subsequent attempt used Android assets
at the web root and failed in the mail-link browser check. Building root web
assets resolved that failure; isolating Android output now prevents recurrence.
The owned persistent runtime was restarted and reports ready.

Public GitHub check status was read for 6ce5fcc: verify and two mail jobs passed;
Workers Builds failed. Its GitHub summary links to a Cloudflare dashboard but
contains no diagnostic build log. That external deployment is not declared fixed.
