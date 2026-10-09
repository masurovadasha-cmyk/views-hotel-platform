#!/usr/bin/env bash
set -euo pipefail
# Run in an isolated, private environment only. This script must not be
# executed against a shared or production database.
for file in \
  0001_service_core.sql \
  0002_inventory_reservations.sql \
  0003_order_items.sql \
  0004_property_access.sql \
  0005_order_audit.sql \
  0006_order_ownership.sql \
  0007_market_pricing.sql \
  0008_guest_booking_access.sql \
  0009_payment_ledger.sql \
  0008_guest_stays.sql \
  0009_guest_bookings.sql \
  0010_booking_schema_compat.sql \
  0011_pms_event_inbox.sql \
  0012_payment_intents.sql \
  0013_payment_ledger_refunds.sql \
  0014_dispatch_tasks.sql \
  0015_cleaning_laundry.sql \
  0016_task_compensation.sql
do
  psql -X -v ON_ERROR_STOP=1 -f "/migrations/$file"
done
# Set up a non-owner app role without BYPASSRLS.
psql -X -v ON_ERROR_STOP=1 -v app_password="$VIEWS_APP_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE views_staging_app LOGIN PASSWORD %L NOBYPASSRLS', :'app_password')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='views_staging_app') \gexec
ALTER ROLE views_staging_app NOBYPASSRLS;
SELECT format('ALTER ROLE views_staging_app PASSWORD %L', :'app_password') \gexec
GRANT USAGE ON SCHEMA public TO views_staging_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO views_staging_app;
SQL
