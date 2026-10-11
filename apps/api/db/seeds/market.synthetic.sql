-- Initial balances and fixed sessions are synthetic disposable-test data only.
DO $$ BEGIN
 IF shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') IS DISTINCT FROM 'VIEWS_DISPOSABLE_CORE_TEST' THEN RAISE EXCEPTION 'DISPOSABLE_DATABASE_REQUIRED'; END IF;
END $$;
INSERT INTO users(id,email,display_name) SELECT ('76900000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'market-fixture-'||n||'@views.invalid','Synthetic market actor '||n FROM generate_series(1,2)n;
INSERT INTO organization_memberships(id,organization_id,user_id,role_id,status,joined_at)
 SELECT ('76900000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'10000000-0000-4000-8000-000000000001',('76900000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,r.id,'active',now()
 FROM generate_series(1,2)n JOIN roles r ON r.code=CASE WHEN n=1 THEN 'warehouse' ELSE 'procurement' END;
INSERT INTO membership_property_scopes(membership_id,property_id) SELECT ('76900000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'10000000-0000-4000-8000-000000000002' FROM generate_series(1,2)n;
INSERT INTO staff_private.credentials(membership_id,password_hash,verification_channel) SELECT ('76900000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'scrypt-v1$131072$8$1$'||repeat('0',32)||'$'||repeat('0',128),'local_fixture' FROM generate_series(1,2)n;
INSERT INTO staff_private.sessions(token_hash,membership_id,credential_version,role_id) SELECT encode(digest(repeat('b'||n::text,32),'sha256'),'hex'),m.id,1,m.role_id FROM generate_series(1,2)n JOIN organization_memberships m ON m.id=('76900000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
INSERT INTO supply_items(id,organization_id,property_id,sku,name,unit) SELECT ('76910000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','MARKET-'||n,'Synthetic packaged item '||n,'piece' FROM generate_series(1,20)n;
INSERT INTO supply_balances(organization_id,property_id,item_id,quantity) SELECT organization_id,property_id,id,5 FROM supply_items WHERE sku LIKE 'MARKET-%';
INSERT INTO service_catalog(id,organization_id,property_id,code,name,currency,price_minor,active,execution_kind) SELECT id,organization_id,property_id,sku,jsonb_build_object('en',name,'ru','Тестовый товар '||sku,'uz','Sinov tovar '||sku),'UZS',100,false,'market' FROM supply_items WHERE sku LIKE 'MARKET-%';
INSERT INTO market_products(service_id,organization_id,property_id,currency,item_id) SELECT id,organization_id,property_id,'UZS',id FROM supply_items WHERE sku LIKE 'MARKET-%';
