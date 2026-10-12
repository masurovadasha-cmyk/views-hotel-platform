# M0d.6 — Expo shell

Критерии: отдельный mobile workspace; guest/staff profiles с разными app IDs;
ru/uz/en через shared; явный disconnected preview; типы и локальный Android JS export;
существующие клиенты проходят проверки без смены React.

Expo57.0.27, React19.2.3 и RN0.86.3 согласованы по bundledNativeModules.json
официального npm-пакета Expo. Новые зависимости нужны для native runtime/Metro;
React18 веб-приложений сохраняется. Generated lock учитывается отдельно от ручного кода.

После frozen pnpm10.18.3 install из корня:
`pnpm --filter @views/mobile typecheck`; `pnpm --filter @views/mobile build`.
Staff bundle: `EXPO_PUBLIC_APP_MODE=staff pnpm --filter @views/mobile build`.
iOS JS: `pnpm --filter @views/mobile build:ios`.
Build scripts очищают Metro cache: профиль задаётся до экспорта, чтобы не переиспользовать guest bundle при staff.
Проверка Linux: `node scripts/mobile-bundle-proof.cjs apps/mobile/dist /tmp/views-staff-export`
после staff export в указанный каталог с --clear. Proof дизассемблирует Hermes через
компилятор RN и проверяет фактический Guest/Staff заголовок App; одних разных хешей недостаточно.
Metro: `EXPO_NO_TELEMETRY=1 pnpm --filter @views/mobile dev` (localhost).
`node --test scripts/mobile-config.acceptance.cjs` проверяет profiles и отказ неизвестного mode.

Android/iOS JS export не является APK/IPA или доказательством работы на устройстве.
EAS profiles guest-preview/staff-preview подготовлены, но облачные builds не запускать
без отдельного разрешения на аккаунт/расходы/подпись. Expo Go не критерий готовности.
Нет логина, API, платежей, push или настоящих данных. Mode не выдаёт права.
Цвета native shell объединены с веб в M0d.8; остальные native tokens ещё не объединены.

Вручную на development build: оба профиля,3 языка, крупный шрифт, safe areas,
клавиатурная/экранная навигация. Native device/emulator acceptance отдельным срезом.
Публичные веб/APK и постоянная БД не меняются. M0 ещё открыт.

Известный блокер выпуска: prod audit текущего lock сообщает2 high; moderate устранён в M0d.7.
High: node-forge (GHSA-86w9-cpqp-85rv) через Expo CLI и braces
(GHSA-vfj7-8cjw-p6xm) через Metro. Реестр не указывает исправленные версии.
Audit gate в CI сохранён и будет блокировать выпуск; это не production-ready SDK
acceptance. Не добавлять audit ignore или неподтверждённый security patch ради зелёного CI.
Следующий security-срез: проверить официальные исправления/совместимый SDK и повторить audit.

## M0d.7 — UUID dependency correction
Узкий override xcode3.0.1 → uuid11.1.1 исправляет GHSA-w5hq-g745-h8pq.
`node --test scripts/mobile-config.acceptance.cjs scripts/mobile-dependencies.acceptance.cjs`
проверяет профили, границы буфера UUID и совместимость записи/чтения Xcode-проекта.
До обновления тест границ падал; после обновления проходит. Зависимости других
пакетов не обновлялись. Audit gate не ослаблен; два high всё ещё блокируют выпуск.
Ручная проверка на устройстве и iOS native build остаются отдельной задачей.

## M0d.8 — shared native colors
Mobile imports @views/ui/native, generated from packages/ui/tokens.css.
After palette edits: `node scripts/generate-native-tokens.cjs`, then
`node scripts/generate-native-tokens.cjs --check` (also enforced in CI).
Light is the first-run default; M0d.9 persists theme and language after selection.
Automatic OS theme synchronization is outside this slice. Manual acceptance on device:
choose both themes in guest/staff, check selected states and all three languages.
Only colors are shared by this adapter; native font/spacing/shadows are not mapped.

## M0d.9 — persisted preferences
Theme/language now persist through app-private expo-file-system/legacy storage.
Run `node --test scripts/mobile-preferences.acceptance.cjs` for format validation,
all6 combinations, serialized writes, failure recovery and read errors.
Loading blocks selection until restoration completes. Failed storage leaves the
current selection usable and displays a localized warning; next selection retries.
No credentials/documents stored. Guest/staff files are separate. Unsupported
versions or damaged JSON fall back to ru/light. No settings migration is required.
On actual Android/iOS builds: select each combination, force-stop/reopen, check
both profiles, repeat changes to an existing file, and verify read-only/full-disk
errors show a warning. Native file replacement/device restart is not proven by
JS export or injected-IO tests; APK/IPA release remains gated separately.

## M0d.10 — native acceptance prerequisites (BLOCKED)
Run `ANDROID_HOME=/path/to/sdk node scripts/mobile-android-preflight.cjs`.
It derives compileSdk/buildTools/NDK from the installed React Native version,
reports missing components and exits1 if any are absent. Exit0 means files exist,
not that Gradle, Java, licenses, emulator or the application have been verified.
Cloud SDK at /workspace/android-tools/sdk has platform/build-tools35, but RN0.86
requires platform36, build-tools36.0.0 and NDK27.1.12297006; all3 are missing.
KVM acceleration check fails (CPU lacks vmx/svm). Historical software-emulator
rendering failure: STAGE7_ANDROID_WEBVIEW_COMPATIBILITY.md. Current adb also cannot
create /home/agent/.android on this read-only home; no device connection established.
No new SDK packages downloaded, native projects generated or APKs built this slice.
Next native runner needs matching SDK/NDK, writable adb user configuration and a
usable device/emulator. Then build BOTH Expo profiles, test all6 locale/theme
combinations through force-stop/relaunch, repeated writes and profile isolation.
Do not substitute the legacy WebView APK for these Expo profile acceptance tests.

## M0d.11 — disposable native generation
`npm_config_cache=/tmp/views-m0-npm-cache node scripts/mobile-native-prebuild.cjs`
generates BOTH profiles in fresh /tmp directories without modifying apps/mobile.
It checks generated application IDs/names; report.json explicitly marks APK/device
acceptance as NOT_RUN. Profiles guest/staff passed on dirty0cded39.
SDK listing succeeded via sdkmanager with ANDROID_USER_HOME=/tmp/views-native-android;
installing platform36/build-tools36/NDK27.1.12297006 failed on NDK HTTP503. Separate
platform/build-tools retry could not connect. Preflight remains blocked.
Generated Gradle9.3.1 wrapper failed downloading distribution (connection refused);
independent HTTPS probes to Gradle checksum and Google repository returned503.
No TLS/checksum bypass, alternate unverified downloads or paid builds used.
After network recovery, retry SDK installation with official SDK manager and run
preflight. In the generated profile/android directory use ANDROID_HOME and a writable
GRADLE_USER_HOME, then ./gradlew :app:assembleDebug --max-workers=2 --no-daemon
-PreactNativeArchitectures=x86_64 for emulator-only debugging. That build command
has NOT succeeded here. Do not distribute an x86_64 debug APK as a phone release.

## M0d.12 — native storage linking proof
mobile-native-prebuild.cjs now runs the installed Expo autolinking resolver for
both generated projects. It verifies exactly one expo-file-system package with
the declared version and FileSystemLegacyModule, plus useExpoModules in Gradle.
Each temporary project retains autolinking.json; report.json includes nativeStorage.
`node --test scripts/mobile-native-modules.acceptance.cjs` rejects missing/duplicate
packages, wrong versions, absent legacy module and disabled Gradle linking.
Both real generated profiles resolve57.0.7 successfully. This proves configuration
resolution only, not Gradle compilation or runtime storage. Google/Gradle HTTPS
probes still return503; APK/device acceptance remains blocked. No repeated downloads.

## M0d.13 — SDK installed, Maven blocks APK
Official SDK manager installed platform36/build-tools36.0.0/NDK27.1.12297006.
Preflight now exits0; aapt2 and NDK clang execute successfully. Existing SDK35 kept.
Gradle9.3.1 downloaded over verified HTTPS and checked against official SHA256;
local archive /tmp/views-gradle-9.3.1-bin.zip, cache /tmp/views-native-gradle.
Environment helper `/workspace/android-tools/configure-views-gradle.py` configures
injected proxy and public CA trust for Gradle; TLS validation remains enabled.
The helper is environment-local, not repository source. Saved startup draft refers
to it; a fresh machine must restore the snapshot, not assume Git contains tooling.
Guest debug x86_64 build executed10 tasks and failed resolving Google Maven
com.android.tools.build:gradle-api:8.5.0 (HTTP503); exact URL recheck also503.
This supersedes missing SDK/Gradle blockers above. Native compile/APK/device gates
remain open. Five prerequisite/autolinking tests passed; no app source changed.

## M0d.14 — standalone ARM64 preview APKs built
Network recovered. Guest x86_64 debug Gradle build PASS (160 tasks), then guest
ARM64 release-mode build PASS (240 tasks) and staff ARM64 release-mode PASS (240).
These use the Expo template TEST signing key, not an approved production signer.
Release-mode packages contain Hermes JS and do not require a Metro server.
Artifacts: /workspace/views-artifacts/views-{guest,staff}-preview-arm64.apk (~26MB).
Application IDs uz.views.preview.guest/staff, version0.1.0/code1, minimum Android24.
No public deployment, APK installation/device execution or production readiness.
Verification command from repository root:
`ANDROID_HOME=/workspace/android-tools/sdk node scripts/mobile-apk-proof.cjs /workspace/views-artifacts/views-guest-preview-arm64.apk /workspace/views-artifacts/views-staff-preview-arm64.apk`
Checks signature, exact app ID, only ARM64, non-debuggable manifest, embedded Hermes
App profile and SHA256; swapped APK inputs are rejected. Report stored alongside APKs.
To reproduce after mobile-native-prebuild.cjs: configure Gradle proxy/CA using the
environment helper; use verified Gradle9.3.1 archive/checksum as documented above.
In each generated app/build.gradle react block set
`extraPackagerArgs = ["--max-workers", "2", "--reset-cache"]` after bundleCommand.
In generated android directory run NODE_ENV=production, EXPO_NO_TELEMETRY=1,
EXPO_PUBLIC_APP_MODE=guest (or staff), ANDROID_HOME=/workspace/android-tools/sdk,
ANDROID_USER_HOME=/tmp/views-native-android, GRADLE_USER_HOME=/tmp/views-native-gradle
with `./gradlew :app:assembleRelease --max-workers=2 --no-daemon -PreactNativeArchitectures=arm64-v8a`.
App source matched the checkout; generated native projects remain outside Git.
Manual gate: install both on ARM64 Android7+, open without Metro, test all6 settings
combinations, force-stop/reopen, verify profile isolation and large text. Interfaces
remain disconnected shells. Two known high dependency findings still block release.

## M0d.15 — emulator runtime attempt: ENVIRONMENT BLOCKED
Built standalone guest x86_64 release-mode APK from10e1e73 (3m57s). This is a
separate emulator build; the two delivered ARM64 APKs remain unchanged and pass
artifact proof. No physical ARM64 device is connected.
Created isolated Android29 AVD under /tmp/views-native15-avd, port5584,2 cores,
2048MB, software acceleration, swiftshader_indirect, no snapshots/audio/window.
ADB workaround works: disposable postgres:16-bookworm container, no database
service or volume, SDK/APK read-only mounts, tmpfs /root/.android and /tmp,
host network with `adb -L tcp:5049 server nodaemon`. Confirmed listener127.0.0.1.
Do not use `-L tcp:127.0.0.1:5049`: this adb version rejects the hostname syntax.
ADB transport became online, but sys.boot_completed never confirmed. Screenshot
shows System UI isn't responding. Install returned224: package service Broken pipe32.
VIEWS was NOT launched; settings/runtime acceptance NOT_RUN. This is Android OS
failure before app acceptance, not evidence that VIEWS itself crashed.
Owned emulator, ADB container and boot observer stopped. Evidence:
/workspace/views-artifacts/native15/{result.json,install.log,system-ui-anr.png}.
Do not repeat software-emulator acceptance without a changed prerequisite. Native
acceptance now requires a working physical device or accelerated Android runner.
Independent backend/UI slices may proceed; do not mark M0/M5 native gates complete.
