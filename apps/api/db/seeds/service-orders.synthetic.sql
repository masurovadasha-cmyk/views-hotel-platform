-- Disposable CI only. These fixed tokens are synthetic fixtures, never credentials for a deployment.
DO $$ BEGIN
 IF shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') IS DISTINCT FROM 'VIEWS_DISPOSABLE_CORE_TEST' THEN RAISE EXCEPTION 'DISPOSABLE_DATABASE_REQUIRED'; END IF;
END $$;
INSERT INTO users(id,email,display_name)
SELECT ('76800000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'service-fixture-'||n||'@views.invalid','Synthetic service actor '||n FROM generate_series(1,4)n;
INSERT INTO organization_memberships(id,organization_id,user_id,role_id,status,joined_at)
SELECT ('76800000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'10000000-0000-4000-8000-000000000001',
 ('76800000-0000-4000-8000-'||lpad((CASE WHEN n=5 THEN 2 ELSE n END)::text,12,'0'))::uuid,r.id,'active',now()
FROM generate_series(1,5)n JOIN roles r ON r.code=CASE WHEN n=1 THEN 'manager' WHEN n IN (2,3) THEN 'housekeeper' WHEN n=4 THEN 'accountant' ELSE 'front_desk' END;
INSERT INTO membership_property_scopes(membership_id,property_id)
SELECT ('76800000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'10000000-0000-4000-8000-000000000002' FROM generate_series(1,5)n;
INSERT INTO staff_private.credentials(membership_id,password_hash,verification_channel)
SELECT ('76800000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'scrypt-v1$131072$8$1$'||repeat('0',32)||'$'||repeat('0',128),'local_fixture' FROM generate_series(1,5)n;
INSERT INTO staff_private.sessions(token_hash,membership_id,credential_version,role_id)
SELECT encode(digest(repeat('a'||n::text,32),'sha256'),'hex'),m.id,1,m.role_id
FROM generate_series(1,5)n JOIN organization_memberships m ON m.id=('76800000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
