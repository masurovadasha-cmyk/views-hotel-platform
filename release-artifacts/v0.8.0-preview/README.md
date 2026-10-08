# Public signed release assets

Source: 72bc4b159f7a2f9e620bd98204c8661dff7d9f91, clean build.
This dedicated delivery branch contains only public APK/checksum/evidence assets.
No signing key or password is present. GitHub Actions verifies signature, checksum
and embedded source before uploading to the existing draft prerelease.
Direct uploads from the cloud workspace failed HTTP 401 on uploads.github.com;
repository Git/API access worked, so the normal GitHub Actions token delivers
these public files. See docs/RELEASE_0_8_PREVIEW.md for functional limitations.
