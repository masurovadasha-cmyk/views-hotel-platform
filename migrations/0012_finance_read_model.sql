-- Stage 4 finance read model for Pages/D1 staging.
-- PostgreSQL payments + double-entry ledger remain the financial source of truth.
-- These projection tables are read-only from the Pages API and contain no card data.

CREATE TABLE IF NOT EXISTS finance_payment_projection(
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  property_id TEXT NOT NULL REFERENCES properties(id),
  reservation_id TEXT NOT NULL REFERENCES reservations(id),
  provider TEXT NOT NULL,
  status TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK(amount_minor>=0),
  captured_minor INTEGER NOT NULL DEFAULT 0 CHECK(captured_minor>=0),
  refunded_minor INTEGER NOT NULL DEFAULT 0 CHECK(refunded_minor>=0),
  currency TEXT NOT NULL,
  source_version INTEGER NOT NULL DEFAULT 1,
  source_updated_at TEXT,
  projected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(captured_minor<=amount_minor),
  CHECK(refunded_minor<=captured_minor)
);
CREATE INDEX IF NOT EXISTS idx_finance_payment_property_status
ON finance_payment_projection(organization_id,property_id,status,projected_at);

CREATE TABLE IF NOT EXISTS finance_ledger_journal_projection(
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  property_id TEXT NOT NULL REFERENCES properties(id),
  reference_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL,
  posted_at TEXT,
  source_version INTEGER NOT NULL DEFAULT 1,
  projected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_finance_journal_property
ON finance_ledger_journal_projection(organization_id,property_id,status,posted_at);

CREATE TABLE IF NOT EXISTS finance_ledger_entry_projection(
  id TEXT PRIMARY KEY,
  journal_id TEXT NOT NULL REFERENCES finance_ledger_journal_projection(id) ON DELETE CASCADE,
  account_code TEXT NOT NULL,
  account_type TEXT NOT NULL,
  side TEXT NOT NULL CHECK(side IN ('debit','credit')),
  amount_minor INTEGER NOT NULL CHECK(amount_minor>0),
  currency TEXT NOT NULL,
  memo TEXT,
  projected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_finance_entry_journal
ON finance_ledger_entry_projection(journal_id,account_code,currency);
