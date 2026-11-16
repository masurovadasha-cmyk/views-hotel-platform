# Preview0.16.0 — 2026-11-16

Public web: https://masurovadasha-cmyk.github.io/views-hotel-platform/?release=0.16.0-preview
Published source:08e4b65226557d0043c893be37ee6e30a8f6006b.
GitHub Pages workflow43843881103: build/deploy success.
Root983 tests pass. Public release metadata and downloaded assets verified;
headless browser checks pass: public directions,9 role entries, V Market and
Light/Dark reference viewer. This is static-demo: Core/SMS/email/payment APIs
are disconnected. Local backend changes are not a public backend deployment.
Cloudflare was not deployed in this release.

Android0.16.0-preview/versionCode1600001 built from the same clean source.
Compiled manifest and291 bundled assets verified; Android web browser proof
passes at360/390/768/1440, no JS errors or external requests. Physical device
installation has not been tested.
Unsigned package:review-output/VIEWS-Review-unsigned.apk,8913824 bytes.
SHA256:1440499ba55e3f58010ed0a222aab0fe9732a553333dde4c027225d9c96ed668.
NOT INSTALLABLE: signing has not been performed. The previously documented
/workspace/.views-preview-signing/preview.p12 is absent. Owner was asked to
restore the existing signing directory through secure environment storage;
no new key or Android identity was created, and no unsigned APK was published
as an installable release. Expected certificate fingerprint remains in
RELEASE_0_15_PREVIEW.md. Rebuild/sign from the published source using the
existing signing helper after restoring the key; do not bypass clean-source
or certificate-pin checks.
