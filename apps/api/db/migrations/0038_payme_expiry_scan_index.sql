BEGIN;
-- Bound maintenance scans to pending transactions within one merchant tenant.
CREATE INDEX payme_pending_expiry_scan_idx
  ON payme_merchant_transactions(organization_id,payme_time_ms,id)
  WHERE state=1;
COMMIT;
