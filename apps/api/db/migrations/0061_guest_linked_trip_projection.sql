BEGIN;
-- A grant is for this reservation, never every stay sharing the CRM profile.
CREATE OR REPLACE FUNCTION app.guest_email_trips(session_hash text,after_time timestamptz,after_id uuid,target_id uuid)
RETURNS TABLE(id uuid,confirmation_code text,status text,check_in_at timestamptz,check_out_at timestamptz,
 currency text,total_minor text,property_name jsonb,city text,timezone text,cursor_time text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE account_id uuid;
BEGIN
 SELECT guest_user_id INTO account_id FROM app.resolve_guest_email_identity(session_hash);
 IF account_id IS NULL THEN RAISE EXCEPTION 'GUEST_EMAIL_SESSION_INVALID' USING ERRCODE='28000'; END IF;
 IF (after_time IS NULL)<>(after_id IS NULL) OR (target_id IS NOT NULL AND after_id IS NOT NULL) THEN
  RAISE EXCEPTION 'INVALID_GUEST_TRIP_CURSOR' USING ERRCODE='22023';
 END IF;
 RETURN QUERY
 SELECT r.id,r.confirmation_code,r.status::text,r.check_in_at,r.check_out_at,r.currency::text,r.total_minor::text,
  jsonb_strip_nulls(jsonb_build_object('ru',p.name->>'ru','uz',p.name->>'uz','en',p.name->>'en')),
  p.city,p.timezone,to_char(r.check_in_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
 FROM public.reservations r
 JOIN public.guest_profiles g ON r.primary_guest_id=g.id AND r.organization_id=g.organization_id
 JOIN public.properties p ON p.id=r.property_id AND p.organization_id=r.organization_id
 WHERE (g.user_id=account_id OR (g.user_id IS NULL AND EXISTS(
  SELECT 1 FROM guest_identity_private.reservation_links l WHERE l.reservation_id=r.id AND l.organization_id=r.organization_id
   AND l.guest_profile_id=g.id AND l.accepted_by=account_id AND l.accepted_at IS NOT NULL AND l.revoked_at IS NULL))) AND (target_id IS NULL OR r.id=target_id)
  AND (after_time IS NULL OR (r.check_in_at,r.id)<(after_time,after_id))
 ORDER BY r.check_in_at DESC,r.id DESC LIMIT 21;
END $$;
REVOKE ALL ON FUNCTION app.guest_email_trips(text,timestamptz,uuid,uuid) FROM PUBLIC;
COMMIT;
