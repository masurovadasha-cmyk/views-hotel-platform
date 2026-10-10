#!/usr/bin/env bash
set -euo pipefail
# Run in an isolated, private environment only. This script must not be
# executed against a shared or production database.
psql -X -v ON_ERROR_STOP=1 -c "CREATE TABLE IF NOT EXISTS views_staging_schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"
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
  0016_task_compensation.sql \
  0017_guest_notifications.sql \
  0018_notification_jobs.sql \
  0019_notification_recovery_audit.sql \
  0020_market_catalog_metadata.sql
do
  applied="$(psql -X -v ON_ERROR_STOP=1 -Atc "SELECT 1 FROM views_staging_schema_migrations WHERE filename = '$file'")"
  if [[ "$applied" == "1" ]]; then continue; fi
  psql -X -v ON_ERROR_STOP=1 --single-transaction -f "/migrations/$file"
  psql -X -v ON_ERROR_STOP=1 -c "INSERT INTO views_staging_schema_migrations(filename) VALUES ('$file')"
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
