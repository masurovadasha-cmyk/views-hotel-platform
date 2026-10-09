# V-Market local demo recovery and staff error feedback

This increment is based on PR #58, commit e86d4fdd625b51e34697b67444beef5c44a6473e. It changes the existing V-Market React screen, not the shared Core or real payments.

## UI behavior

- Malformed persisted orders, stock and carts no longer become trusted React state without checks. If corrupt, the demo is locked rather than immediately overwriting the original localStorage data; the user can explicitly confirm a destructive demo reset.
- Before guest cart changes, checkout, staff order lifecycle actions and inventory adjustments, the screen compares the current localStorage strings with the values last observed by that tab. Mismatch locks the screen and asks the user to reload. A storage event from another tab also locks the screen. This is a fail-closed guard, not a server transaction or a reliable cross-device inventory system.
- Domain exceptions are mapped to clear Russian feedback instead of raw exception codes; stock and duplicate-request conflicts do not silently proceed.
- Reset asks for explicit confirmation and clears only the two V-Market demo storage keys.

## Remaining boundaries

The browser still owns demo data, and there is no atomic compare-and-swap in localStorage. Two tabs could pass their checks simultaneously. Do not use for live hotel orders, real inventory, card payments, or staff authorization. Further work: server transactional orders, full booking scope and role-based staff workflow, Canva visual parity, browser E2E and Android verification.

The design reference is Canva DAHXhHquzgw (60-page VIEWS Design Pack); this change addresses the error/empty/offline feedback principle but is not a claim that all 60 pages are implemented.
