-- Test-only checks. Run after identity fixtures in production-core CI.
BEGIN;
INSERT INTO market_stock_balances(organization_id,property_id,sku,on_hand,reserved,reorder_point)
VALUES('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','CI-TEST-SKU',5,2,1);

DO $market_stock_checks$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM market_stock_balances WHERE sku='CI-TEST-SKU' AND on_hand=5 AND reserved=2;
  IF n<>1 THEN RAISE EXCEPTION 'MARKET_STOCK_FIXTURE_MISSING'; END IF;

  BEGIN
    INSERT INTO market_stock_balances(organization_id,property_id,sku,on_hand,reserved)
    VALUES('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','CI-OVERRESERVE',2,3);
    RAISE EXCEPTION 'EXPECTED_OVERRESERVE_REJECTION';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO market_stock_balances(organization_id,property_id,sku,on_hand,reserved)
    VALUES('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','CI-NEGATIVE',-1,0);
    RAISE EXCEPTION 'EXPECTED_NEGATIVE_STOCK_REJECTION';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO market_stock_balances(organization_id,property_id,sku,on_hand,reserved)
    VALUES('00000000-0000-0000-0000-000000000001','10000000-0000-4000-8000-000000000002','CI-CROSS-TENANT',5,0);
    RAISE EXCEPTION 'EXPECTED_TENANT_REJECTION';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT IN ('MARKET_STOCK_PROPERTY_ORGANIZATION_MISMATCH') THEN RAISE; END IF;
  END;

  BEGIN
    INSERT INTO market_stock_movements(organization_id,stock_balance_id,movement_type,quantity_delta,reservation_delta)
    SELECT organization_id,id,'reserve',0,3 FROM market_stock_balances WHERE sku='CI-TEST-SKU';
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'VALID_RESERVE_MOVEMENT_REJECTED: %',SQLERRM;
  END;

  BEGIN
    INSERT INTO market_stock_movements(organization_id,stock_balance_id,movement_type,quantity_delta,reservation_delta)
    SELECT organization_id,id,'reserve',-1,1 FROM market_stock_balances WHERE sku='CI-TEST-SKU';
    RAISE EXCEPTION 'EXPECTED_INVALID_MOVEMENT_REJECTION';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $market_stock_checks$;
ROLLBACK;

-- Restricted actor can read a scoped balance but cannot create stock rows.
BEGIN;
SELECT set_config('app.organization_id','00000000-0000-0000-0000-000000000001',true);
SELECT set_config('app.user_id','20000000-0000-4000-8000-000000000001',true);
SELECT set_config('app.membership_id','30000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE views_app;
DO $market_stock_rls$
BEGIN
  BEGIN
    INSERT INTO market_stock_balances(organization_id,property_id,sku,on_hand,reserved)
    VALUES('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','CI-FORBIDDEN',5,0);
    RAISE EXCEPTION 'EXPECTED_WRITE_DENIAL';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $market_stock_rls$;
ROLLBACK;
