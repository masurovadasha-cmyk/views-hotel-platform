-- Invited supply identities used exclusively by the disposable Core service proof.
BEGIN;
DO $guard$ BEGIN
 IF current_database()<>'views' OR shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') IS DISTINCT FROM 'VIEWS_DISPOSABLE_CORE_TEST' THEN RAISE EXCEPTION 'DISPOSABLE_DATABASE_REQUIRED'; END IF;
END $guard$;
INSERT INTO public.users(id,email,display_name,status) VALUES
 ('76500000-0000-4000-8000-000000000001','procurement-auth-proof@views.invalid','Synthetic procurement','active'),
 ('76500000-0000-4000-8000-000000000002','warehouse-auth-proof@views.invalid','Synthetic warehouse','active');
INSERT INTO public.organization_memberships(id,organization_id,user_id,role_id,status)
 SELECT '76500000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000001','76500000-0000-4000-8000-000000000001',id,'invited' FROM public.roles WHERE code='procurement';
INSERT INTO public.organization_memberships(id,organization_id,user_id,role_id,status)
 SELECT '76500000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000001','76500000-0000-4000-8000-000000000002',id,'invited' FROM public.roles WHERE code='warehouse';
INSERT INTO public.membership_property_scopes(membership_id,property_id) VALUES
 ('76500000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000002'),
 ('76500000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000002');
SELECT staff_private.issue_token('76500000-0000-4000-8000-000000000011','invite',encode(public.digest(repeat('1',64),'sha256'),'hex'),'local_fixture');
SELECT staff_private.issue_token('76500000-0000-4000-8000-000000000012','invite',encode(public.digest(repeat('2',64),'sha256'),'hex'),'local_fixture');
-- Independent active role fixtures for service/RLS tests; no password credential.
INSERT INTO public.users(id,email,display_name,status) VALUES
 ('76600000-0000-4000-8000-000000000001','procurement-service-proof@views.invalid','Synthetic buyer service','active'),
 ('76600000-0000-4000-8000-000000000002','warehouse-service-proof@views.invalid','Synthetic warehouse service','active'),
 ('76600000-0000-4000-8000-000000000003','foreign-supply-service-proof@views.invalid','Synthetic foreign service','active');
INSERT INTO public.organization_memberships(id,organization_id,user_id,role_id,status)
 SELECT '76600000-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000001','76600000-0000-4000-8000-000000000001',id,'active' FROM public.roles WHERE code='procurement';
INSERT INTO public.organization_memberships(id,organization_id,user_id,role_id,status)
 SELECT '76600000-0000-4000-8000-000000000012','00000000-0000-0000-0000-000000000001','76600000-0000-4000-8000-000000000002',id,'active' FROM public.roles WHERE code='warehouse';
INSERT INTO public.organization_memberships(id,organization_id,user_id,role_id,status)
 SELECT '76600000-0000-4000-8000-000000000013','10000000-0000-4000-8000-000000000001','76600000-0000-4000-8000-000000000003',id,'active' FROM public.roles WHERE code='procurement';
INSERT INTO public.membership_property_scopes(membership_id,property_id) VALUES
 ('76600000-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000002'),
 ('76600000-0000-4000-8000-000000000012','00000000-0000-0000-0000-000000000002'),
 ('76600000-0000-4000-8000-000000000013','10000000-0000-4000-8000-000000000002');
COMMIT;
