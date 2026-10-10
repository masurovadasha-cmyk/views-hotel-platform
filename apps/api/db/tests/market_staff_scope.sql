-- Test restricted-role market access without granting stock write privileges.
-- Run after production-core fixture creation.
BEGIN;
SELECT set_config('app.organization_id','00000000-0000-0000-0000-000000000001',true);
SELECT set_config('app.user_id','20000000-0000-4000-8000-000000000001',true);
SELECT set_config('app.membership_id','30000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE views_app;
DO $market_staff_scope$
DECLARE allowed boolean;
BEGIN
 SELECT app.market_dispatcher_can_write(
   '00000000-0000-0000-0000-000000000001'::uuid,
   '00000000-0000-0000-0000-000000000002'::uuid
 ) INTO allowed;
 IF allowed IS TRUE THEN
   RAISE EXCEPTION 'MARKET_UNEXPECTED_DISPATCHER_PERMISSION';
 END IF;
 BEGIN
   UPDATE market_stock_balances SET reserved=reserved+1
   WHERE organization_id='00000000-0000-0000-0000-000000000001';
   RAISE EXCEPTION 'MARKET_EXPECTED_STOCK_WRITE_DENIAL';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $market_staff_scope$;
ROLLBACK;
