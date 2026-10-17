# Stage 7.46 — guest localization and usable preview navigation

Guest screens and public email-entry UI now support RU/UZ/EN through a 223-message
catalog. Static apartment titles/amenities, navigation, booking previews, SMS
unavailability, service/profile/help text and accessible labels are translated.
The existing English default is retained; only views.guest.locale is persisted.
Staff language preference remains separate. Blocked storage keeps an in-memory
choice and unsupported values fall back to English. Server names and booking data
are displayed unchanged. English-only legacy staff screens retain lang="en".

The shared interpolation helper is text-only, preserves named fields and does not
interpret HTML or recursively expand input. Switching language keeps mounted
forms and does not submit requests. Brand names and browser-native date-control
formatting are not represented as translated application copy.

## Functional corrections

- Guest navigation is available on desktop as well as mobile. Its active section
  is announced with aria-current, with keyboard focus outlines.
- Favorites can be filtered directly or opened from the profile. Search results
  can receive focus; an empty filtered catalog has an explicit message.
- Help search filters translated topics; expandable answers replace inert buttons.
  Reviews/payment-method management is marked unavailable instead of doing nothing.
- Booking journey windows trap keyboard focus, support Escape, announce their
  title and restore focus to the triggering control. A title change focuses the
  new heading without remounting the form. SMS focus no longer resets merely
  because its parent's close callback was recreated.
- The legacy connected guest booking list now opens the selected server booking's
  code, property, unit, dates, city and status. It previously opened the first demo
  apartment regardless of the selected booking. No photo/address/access code is
  invented for that record. Load failures now offer Retry instead of reporting
  an empty booking list.
- Demo requests/messages are disabled and labeled as examples. Booking/payment
  previews carry an explicit preview notice; previewing a confirmation does not
  claim an actual booking. Payment and cancellation remain disabled.

No provider, guest Core integration, new permission or production environment is
activated. Existing /api guest endpoints remain the legacy contract; this UI work
must not be described as moving them to the PostgreSQL Core.

## Repeatable checks

```
npm run build
npm test
npm run test:guest
npm run build:android
node scripts/android-review-web-proof.cjs
VIEWS_GUEST_PROOF_BUILD=dist-android npm run test:guest
```

The guest browser runner intercepts all resources and uses fixed synthetic API
responses for connected-booking and public-login checks. External requests fail
the proof. It does not call real login/email/booking services. Reports in ignored
review-output/guest-locale-web-evidence.json and guest-locale-android-evidence.json
record exact source SHA/dirty status and explicitly identify API fixtures.
cloud:verify now includes test:guest; no fresh complete aggregate run is claimed.

## Evidence and limits

Dirty continuation of 75612486975c3d92866a55bacceae6daae864d04:

- Web typecheck/build and 233 tests / 38 files passed (five new guest catalog,
  source-call coverage, static-data coverage, locale and interpolation tests).
- Guest browser: seven scenario groups passed for web and Android-target assets,
  all three languages and all five tabs at 360/390/768/1440 widths; modal widths,
  focus, SMS, preview gates, preserved form, favorites/help, storage fallback,
  mocked two-booking selection/retry and mocked login errors were exercised.
- Existing Android asset-origin proof passed: four offline photographs, demo
  navigation, SMS focus/reload/four widths; no external requests or page errors.
- Staff regression passed: HTTP 13 groups / 32 calls, locale browser eight groups,
  and booking/reload/restart/navigation/logout at four widths.
- Core typecheck/build, staff-auth 20 tests / 3 files, mail acceptance 15 tests and
  network gate 119 scanned files with no findings passed. No migrations changed.
- Russian guest mobile/desktop screenshots were inspected locally.

The first multi-language browser attempt incorrectly expected blank dates on the
second iteration even though the form correctly preserved them. The test now
explicitly clears a date when testing the disabled Continue button; the subsequent
full run passed. Final clean-source reports identify the committed source.

Native device/upgrade acceptance, a permanent signed APK and publication remain
open. English/Uzbek wording needs native-speaker review before release; this is not
full screen-reader certification. Legacy staff/demo screens outside the connected
Core workspace, owner/cleaner workflows and their localization remain unfinished.
