# H1: owner calendar recovery

Base: `20decdfff77b2fb59e73496e6e374d1e42e7638b`. This bounded slice extends
existing manual block/unblock; it does not implement host payouts, service-price
commission settings, OTA sync, or hold-release recovery.

## Contract

GET calendar returns the authorized organization/user/membership/property recovery
scope. The browser must not manufacture this from a selected demo role. Initial
POST preserves the existing block/unblock body and UUID idempotency key. A saved
unknown attempt adds `recoveryOnly:true`; this flag is excluded from the immutable
command hash. Every error retains the attempt. A valid receipt alone clears it.

The existing outbox command journal is serialized by the existing
organization/membership/key advisory lock. An absent recovery command commits
`owner.calendar_not_applied`; later original requests cannot execute it. Changed
payloads still conflict. A replay projects current interval existence and exact
original-marker/range compatibility rather than claiming an old block is active.
`status` records the command outcome; `currentState` is blocked/absent/changed.
A not-applied receipt means this command did not run, not that the room is free.

Migration 0135 adds only the narrow current-session predicate. It mirrors the
existing owner/manager + property.manage authorization for active platform-owned
Uzbekistan/Tashkent property scope. It checks current role, credential version,
active identity and session expiry using clock_timestamp. Public EXECUTE is
revoked; only the existing disposable test runtime receives a test grant.
The HTTP local-workspace path requires its staff-session header. Authorization is
rechecked after command waits and before returning/committing mutations. The
session-bearing path avoids locking authority rows before inventory waits, so
revocation can actually occur during the wait. No role is promoted or created by
runtime code. Existing internal non-session authorization remains unchanged.

## Browser state

IndexedDB `views.owner-calendar-recovery.v1` / `attempts` stores only version,
scope, random command key and immutable operational body. No session, CSRF,
credential, guest name or payment data. Atomic claim prevents competing tabs
from sending a second pending command in the same scope; conditional deletion
cannot erase another attempt. Invalid/corrupt/unavailable storage fails closed.

Unknown operation survives reload; retry is explicit, not automatic. Date/form
and in-component Back controls remain locked until resolution. Browser Back or
closing the application cannot guarantee a browser prompt, but stored intent is
retained for return. Original dates are visible in the recovery panel. Read
refresh remains available. A confirmed outcome with failed calendar refresh is
shown separately. A different identity/property never loads another scope's
pending record. Browser storage remains device/origin-specific; clearing site
storage destroys local hints, not Core command history.

## Evidence

Focused UI/locale/calendar tests: 21 PASS. API input tests: 4 PASS. Root/API
TypeScript checks and normal web build PASS on the working candidate. Added
Core integration cases cover committed absence, late-original fencing for block
and unblock, concurrent recovery, and current changed/removed intervals.
`apps/api/db/tests/owner-calendar-recovery.cjs` requires the disposable database
marker and runs as non-superuser runtime with admin-only synthetic fixture setup;
it checks actual owner/manager authorization, tenant/property denial, and ten
observed-wait session/role/membership/credential/expiry revocation cases.
Core execution and independent browser evidence are recorded by the coordinator
when run; source presence alone is not a passing result.
