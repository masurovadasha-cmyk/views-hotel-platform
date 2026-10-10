BEGIN;
-- Runtime scope rows are read-only under RLS. Lock a validated session's own
-- scope through a narrow definer routine, without granting scope writes.
CREATE FUNCTION app.staff_stay_scope(target_org uuid,target_hash text,target_property uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE identity jsonb; permitted uuid;
BEGIN
 identity:=app.staff_stay_authorize(target_org,target_hash);
 IF identity IS NULL OR NOT EXISTS(SELECT 1 FROM public.properties WHERE id=target_property AND organization_id=target_org) THEN RETURN false; END IF;
 SELECT property_id INTO permitted FROM public.membership_property_scopes
 WHERE membership_id=(identity->>'membershipId')::uuid AND property_id=target_property FOR SHARE;
 RETURN permitted IS NOT NULL;
END $fn$;
REVOKE ALL ON FUNCTION app.staff_stay_scope(uuid,text,uuid) FROM PUBLIC;
COMMIT;
