BEGIN;
-- Account ownership is an explicit user_id link, never an email/phone match.
CREATE INDEX guest_profiles_account_scope_idx ON guest_profiles(user_id,organization_id,id) WHERE user_id IS NOT NULL;
CREATE INDEX reservations_guest_page_idx ON reservations(primary_guest_id,organization_id,check_in_at DESC,id DESC) WHERE primary_guest_id IS NOT NULL;
-- Existing staff RLS is unchanged. The guest has no tenant-wide table policy.
-- A narrow projection resolves the session again in the same statement snapshot.
CREATE FUNCTION app.guest_email_trips(session_hash text,after_time timestamptz,after_id uuid,target_id uuid)
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
 FROM public.guest_profiles g
 JOIN public.reservations r ON r.primary_guest_id=g.id AND r.organization_id=g.organization_id
 JOIN public.properties p ON p.id=r.property_id AND p.organization_id=r.organization_id
 WHERE g.user_id=account_id AND (target_id IS NULL OR r.id=target_id)
  AND (after_time IS NULL OR (r.check_in_at,r.id)<(after_time,after_id))
 ORDER BY r.check_in_at DESC,r.id DESC LIMIT 21;
END $$;
REVOKE ALL ON FUNCTION app.guest_email_trips(text,timestamptz,uuid,uuid) FROM PUBLIC;
COMMIT;
