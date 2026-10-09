# VIEWS web + Android review build

One frontend source: the existing src/ VIEWS application. The same dist assets are deployed to GitHub Pages and bundled into a lightweight Android WebView shell. This is not Vertex Vision and not a second product frontend.

Review only: guest UI, Staff CRM, role switching, and light/dark modes with demonstration data. No production Core, real guest authentication, real payments, passport processing, or provider integrations are activated by this build. Do not enter real passports or bank card information.

Android application ID: uz.views.review. Minimum Android: 8.0 (API 26). Only Internet permission. No JS-native bridge, file access, mixed HTTP content, or certificate bypass. Local assets are served under the reserved HTTPS appassets.androidplatform.net origin.

The APK is signed with an ephemeral review-only key. It is not a store release or a stable production signing identity. Future review builds signed by another key may require uninstalling this review package. Physical device installation is not claimed unless separately recorded.

Run npm run build:pages, then python3 scripts/build-android-review.py with Android platform 35 and build-tools installed. CI records signature validation, manifest metadata, SHA-256, matching embedded web assets, and browser smoke results.

Publishing this review changes only GitHub Pages staging and creates a marked prerelease. main and production infrastructure are not changed.
