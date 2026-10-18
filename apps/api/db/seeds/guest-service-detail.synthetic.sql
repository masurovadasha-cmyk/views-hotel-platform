-- Three reserved products for direct guest-detail tests, independent of prior suites.
DO $$ BEGIN
 IF shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') IS DISTINCT FROM 'VIEWS_DISPOSABLE_CORE_TEST' THEN RAISE EXCEPTION 'DISPOSABLE_DATABASE_REQUIRED'; END IF;
END $$;
INSERT INTO supply_items(id,organization_id,property_id,sku,name,unit) SELECT ('76910000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','DETAIL-'||n,'Synthetic detail item '||n,'piece' FROM generate_series(61,63)n;
INSERT INTO supply_balances(organization_id,property_id,item_id,quantity) SELECT organization_id,property_id,id,5 FROM supply_items WHERE id BETWEEN '76910000-0000-4000-8000-000000000061' AND '76910000-0000-4000-8000-000000000063';
INSERT INTO service_catalog(id,organization_id,property_id,code,name,currency,price_minor,active,execution_kind) SELECT id,organization_id,property_id,sku,'{"en":"Synthetic detail"}','UZS',100,false,'market' FROM supply_items WHERE id BETWEEN '76910000-0000-4000-8000-000000000061' AND '76910000-0000-4000-8000-000000000063';
INSERT INTO market_products(service_id,organization_id,property_id,currency,item_id) SELECT id,organization_id,property_id,'UZS',id FROM supply_items WHERE id BETWEEN '76910000-0000-4000-8000-000000000061' AND '76910000-0000-4000-8000-000000000063';
