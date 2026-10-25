# Legacy catalogue regression correction (candidate)

Source reviewed: `79fa964aacd30bcb8812e7f327a8f2fbe9d60b63`, PR94.
The old browser script expected a live minimart textarea. V1 intentionally
keeps the local demo market and its IndexedDB ledger out of live guest mode;
the live minimart service is disconnected and has no submission form. Restoring
that form merely to satisfy an old test would contradict the live-boundary proof.

The corrected browser script checks four disconnected directions (transfer,
excursions, tickets, minimart) in three languages/two themes/three widths, with
no form, no local market mount, no demo shortcut and no IndexedDB opens. The
other seven existing UI forms still submit their exact category and booking ID
to synthetic fixtures. These fixture responses do not prove server acceptance.

A separate unit contract preserves all eight presentation request mappings,
including minimart and spa, without enabling either integration. Inspection
found that the legacy `functions/api/guest-service-orders.ts` allowlist includes
minimart but omits spa. The existing browser fixture had hidden this distinction.
This patch does not change that endpoint, widen its allowlist, activate Core spa,
or turn a UI request mapping into an operational capability.

Look-ahead audit of existing scripts found the public-release smoke still used
the retired `Review list` label and assumed the basket was on the catalogue
panel. It now enters the basket explicitly, waits for durable operations, opens
`Review demo order`, and verifies no order was confirmed. TLS verification,
metadata, reference-viewer, role-entry, count, layout and no-network assertions
remain. Other market CI scripts at the reviewed SHA already use the explicit
market-view helper; no additional obvious old-panel assumption was identified
by static inspection. This is not execution evidence for those later scripts.

Prepared files passed Node syntax checks only. Unit/browser execution and final
CI remain required at the integrated SHA. No runtime source, API policy, schema,
release version or screen-acceptance registry changes are included.
