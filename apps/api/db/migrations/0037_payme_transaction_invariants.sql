BEGIN;

-- A valid tenant GUC must not permit a provider row to point at another tenant's
-- payment intent. This FK supplements RLS; constraints also apply to owners.
ALTER TABLE payment_intents ADD CONSTRAINT payment_intents_org_id_unique UNIQUE(organization_id,id);
ALTER TABLE payme_merchant_transactions ADD CONSTRAINT payme_intent_tenant_fk
  FOREIGN KEY(organization_id,payment_intent_id) REFERENCES payment_intents(organization_id,id);
ALTER TABLE payme_merchant_transactions ADD CONSTRAINT payme_account_binding
  CHECK(account=jsonb_build_object('payment_intent_id',payment_intent_id::text));
ALTER TABLE payme_merchant_transactions ADD CONSTRAINT payme_transaction_id_format
  CHECK(payme_transaction_id::text ~ '^[a-f0-9]{24}$');
ALTER TABLE payme_merchant_transactions ADD CONSTRAINT payme_transaction_state_invariants CHECK(
  (state=1 AND perform_time_ms=0 AND cancel_time_ms=0 AND reason IS NULL)
  OR (state=2 AND perform_time_ms>0 AND cancel_time_ms=0 AND reason IS NULL)
  OR (state=-1 AND perform_time_ms=0 AND cancel_time_ms>0 AND reason IS NOT NULL)
  OR (state=-2 AND perform_time_ms>0 AND cancel_time_ms>0 AND reason IS NOT NULL)
);

COMMIT;
