-- SYNTHETIC ONLY. Must never run against views_local or a production database.
BEGIN;
DO $$ BEGIN
 IF current_database()<>'views' OR shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') IS DISTINCT FROM 'VIEWS_DISPOSABLE_CORE_TEST' THEN
  RAISE EXCEPTION 'DISPOSABLE_DATABASE_REQUIRED';
 END IF;
END $$;
INSERT INTO users(id,email,display_name) VALUES('b1000000-0000-4000-8000-000000000001','b1-accountant@views.test','SYNTHETIC B1 accountant');
INSERT INTO organization_memberships(id,organization_id,user_id,role_id,status)
 SELECT 'b1000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000001','b1000000-0000-4000-8000-000000000001',id,'active' FROM roles WHERE code='accountant';
INSERT INTO membership_property_scopes(membership_id,property_id) VALUES('b1000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000002');
INSERT INTO service_catalog(organization_id,property_id,code,name,currency,price_minor,commission_bps)
 VALUES('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','SYNTHETIC_TRANSFER','{"ru":"Тестовый трансфер","uz":"Sinov transferi","en":"Synthetic transfer"}','UZS',100000,1000);
INSERT INTO promotion_codes(organization_id,code,name,discount_bps,valid_from,valid_until,max_redemptions)
 VALUES('00000000-0000-0000-0000-000000000001','SYNTHETIC10','{"ru":"Тест","uz":"Sinov","en":"Synthetic"}',1000,now(),now()+interval '1 day',10);
INSERT INTO loyalty_tiers(organization_id,code,name,completed_stays_required,discount_bps)
 VALUES('00000000-0000-0000-0000-000000000001','SYNTHETIC_5','{"ru":"Тест","uz":"Sinov","en":"Synthetic"}',5,500);
-- No real tax rates, provider credentials, bank details or business inventory.
COMMIT;
