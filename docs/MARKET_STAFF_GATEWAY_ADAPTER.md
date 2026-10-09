# VIEWS Staff CRM browser gateway adapter

Adds `src/domain/marketStaffGateway.ts` as an opt-in, read-only client adapter for order detail. The adapter is **disabled by default**. When explicitly enabled by a future verified integration, it calls only the same-origin `/api/staff/market/...` gateway using the user's authenticated session. It never calls `/v1/internal/market` directly and never bundles service credentials or accepts arbitrary gateway origins.

The same-origin gateway **does not exist in this change**. Before enabling, implement server-side session authorization, signed internal service identity, CSRF/session controls, access logs, property and staff-role enforcement, and robust response validation. The adapter rejects malformed identifiers and inconsistent UZS minor-unit totals. It does not change the localStorage demo, real payments, web deployment or Android APK.
