BEGIN;
-- Explicit opt-in, default empty. Provisioning is an operator action, not guest API.
CREATE TABLE guest_identity_private.catalog_properties(
 property_id uuid PRIMARY KEY REFERENCES public.properties(id)
);
ALTER TABLE guest_identity_private.catalog_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_identity_private.catalog_properties FORCE ROW LEVEL SECURITY;
REVOKE ALL ON guest_identity_private.catalog_properties FROM PUBLIC;
CREATE FUNCTION app.guest_catalog_search(session_hash text,arrival date,departure date,guests integer,city_filter text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE account_id uuid; result jsonb;
BEGIN
 SELECT guest_user_id INTO account_id FROM app.resolve_guest_identity(session_hash);
 IF account_id IS NULL THEN RAISE EXCEPTION 'GUEST_SESSION_INVALID' USING ERRCODE='28000'; END IF;
 IF arrival IS NULL OR departure IS NULL OR departure<=arrival OR departure-arrival>62
  OR guests IS NULL OR guests NOT BETWEEN 1 AND 20 OR city_filter IS NULL OR length(city_filter)>80 THEN
  RAISE EXCEPTION 'GUEST_SEARCH_INPUT_INVALID' USING ERRCODE='22023';
 END IF;
 SELECT COALESCE(jsonb_agg(row_data),'[]'::jsonb) INTO result FROM (
 SELECT jsonb_build_object('propertyId',p.id,'propertyName',p.name,'city',p.city,'timezone',p.timezone,
  'unitId',u.id,'ratePlanId',rp.id,'maxGuests',ut.max_guests,'currency',rp.currency,
  'baseNightlyMinor',rp.base_nightly_minor::text) row_data
 FROM guest_identity_private.catalog_properties published
 JOIN public.properties p ON p.id=published.property_id AND p.status='active'
 JOIN public.units u ON u.property_id=p.id AND u.status='active'
 JOIN public.unit_types ut ON ut.id=u.unit_type_id AND ut.property_id=p.id
 JOIN public.rate_plans rp ON rp.property_id=p.id AND rp.unit_type_id=ut.id AND rp.active
 JOIN public.cancellation_policy_templates cp ON cp.id=rp.cancellation_policy_id AND cp.organization_id=p.organization_id AND cp.active
 WHERE ut.max_guests>=guests AND (city_filter='' OR lower(p.city)=lower(city_filter))
 AND NOT EXISTS(SELECT 1 FROM public.inventory_periods ip WHERE ip.unit_id=u.id
  AND ip.stay_period&&tstzrange((arrival+time '14:00') AT TIME ZONE p.timezone,(departure+time '12:00') AT TIME ZONE p.timezone,'[)'))
 ORDER BY p.id,u.id,rp.id LIMIT 51
 ) rows;
 RETURN jsonb_build_object('items',result,'priceKind','base_nightly_excludes_charges','requiresQuote',true);
END $$;
REVOKE ALL ON FUNCTION app.guest_catalog_search(text,date,date,integer,text) FROM PUBLIC;
COMMIT;
