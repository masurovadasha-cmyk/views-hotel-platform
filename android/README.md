# VIEWS Android development shell

This Android app is a **debug-only HTTPS WebView launcher**, not a production Android release. It can open a separately deployed, authorized VIEWS development server. It does not embed a database, run a backend, or enable real payments.

Security defaults:
- HTTPS only, no cleartext HTTP.
- No access to local files, no file URL access.
- Mixed content disabled, third-party cookies disabled.
- External domains open in the system browser, not in the authenticated WebView.
- Debug APK is not Play Store ready and is not signed with a release key.

To build: `gradle :app:assembleDebug` with Android SDK platform 35 and JDK 17. APK is `android/app/build/outputs/apk/debug/app-debug.apk`.

When testing against a local-only server at 127.0.0.1:3200, this APK cannot connect directly. First deploy a **private** HTTPS staging environment with production-grade identity, access controls, and a test-only dataset.
