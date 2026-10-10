# Stage 7.36 — encrypted synthetic file preview

The local reception card can open an operator-prepared synthetic text file.
This is a closed rehearsal: the sealing helper generates one fixed text template
with a document UUID and accepts no arbitrary file contents. It is not a passport
scanner, upload endpoint, identity check or real document-vault integration.
The registration vault registry remains unchanged and cannot use this adapter.

## Storage and authorization

The existing guest_document_records.encrypted_fields stores AES-256-GCM ciphertext
with a random 96-bit nonce and authentication tag. Additional authenticated data
binds the vault format, organization, reservation, guest and document IDs. Opening
requires the expected template and SHA-256 checksum as well as the GCM tag. Wrong
keys, moved/corrupted blobs and oversized input fail with a fixed error.

The cloud launcher adds one separate random documentVaultKey to its existing
private runtime configuration (0600), preserving prior secrets. It injects
VIEWS_LOCAL_DOCUMENT_KEY and explicitly opts into VIEWS_LOCAL_DOCUMENT_PILOT_ENABLED.
The stay pilot and local NODE_ENV=test boundary must also hold. Do not print or
commit that configuration. Keep the private key with an authorized private backup
of the installation: a database dump alone cannot decrypt these synthetic blobs.
There is no key rotation or real KMS integration in this increment. An invalid
key configuration fails rather than being silently replaced.

POST document-view uses the existing session/CSRF/workspace gateway and Core's
locked front-desk reservation.manage/property authorization. The document must
belong to the primary guest of the requested marked zero-charge stay and use the
synthetic vault ID. The stay must be confirmed or checked in. Core rechecks the
live session after document lock waits. Every successful view commits an audit
record containing actor/entity IDs and the reservation ID; it stores no plaintext
or content-bearing idempotency snapshot. Failed audit commits do not return a file.

Core and gateway return Cache-Control: no-store. There is no public URL or bearer
view token. The UI renders escaped text, closes on demand, after 60 seconds or when
the tab becomes hidden, and ignores responses after unmount. These UI controls do
not prevent a user from copying already displayed content. Existing logout and
session-expiry handling removes the workspace. Every later read reauthorizes.

The document projection now includes previewId only for the synthetic vault's
encrypted records, superseding the earlier blanket no-document-ID description.
It still exposes no storage path, key, checksum, document number or real file.

## Reproduction and evidence

Build web and Core, start the existing cloud rehearsal, then run cloud:test:auth
before cloud:test:stay. The proof creates separate synthetic reservations only.
The preparation helper's explicit --document-preview option uses the built Core
sealing helper; no browser file upload or external provider is involved.

On the dirty continuation of a6665647a45ff4882e2cd50adb2a8464303d3cb0:
web/Core builds and typechecks passed; root 220/36 files; Core 280/56 files;
mail policy 15; network gate 119 files, no findings. Core cases include randomized
nonces, binding every ID, invalid key/checksum/size, ciphertext tampering, invalid
UUID, another reservation, disabled pilot, revoked session, private audit and
absence of content-bearing command records. Browser results are recorded in the
handoff, including cache headers, CSRF/scope denial, manual/automatic close and
post-logout denial. No new migrations: 46 retained.

Real uploads, file viewing from a selected regional provider, key recovery/KMS,
malware/content handling, document-review decisions and state registration remain
separate work. No external email, payments, production or public tunnel activated.
