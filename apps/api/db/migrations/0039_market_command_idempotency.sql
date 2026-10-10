BEGIN;
CREATE TABLE market_command_idempotency (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id),
 command_type text NOT NULL CHECK(command_type IN ('checkout','assignment','status')),
 idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 160),
 request_hash char(64) NOT NULL,
 order_id uuid,
 result jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,command_type,idempotency_key),
 FOREIGN KEY(organization_id,order_id) REFERENCES market_service_orders(organization_id,id)
);
ALTER TABLE market_command_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_command_idempotency FORCE ROW LEVEL SECURITY;
-- No public read or write policy. Internal transactional service will be reviewed separately.
COMMIT;
