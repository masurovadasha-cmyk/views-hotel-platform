BEGIN;
CREATE TABLE guest_identity_private.quote_offers(
 quote_id uuid PRIMARY KEY REFERENCES public.booking_quotes(id),
 profile_id uuid NOT NULL REFERENCES public.guest_profiles(id),
 user_id uuid NOT NULL REFERENCES public.users(id)
);
ALTER TABLE guest_identity_private.quote_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_identity_private.quote_offers FORCE ROW LEVEL SECURITY;
REVOKE ALL ON guest_identity_private.quote_offers FROM PUBLIC;
CREATE FUNCTION app.issue_guest_quote(staff_hash text,target uuid,profile uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE q public.booking_quotes; g public.guest_profiles; actor record; offer guest_identity_private.quote_offers;
BEGIN
 SELECT * INTO q FROM public.booking_quotes WHERE id=target FOR UPDATE;
 SELECT * INTO g FROM public.guest_profiles WHERE id=profile AND organization_id=q.organization_id FOR SHARE;
 SELECT * INTO actor FROM app.staff_auth_resolve(staff_hash) s WHERE s.organization_id=q.organization_id
  AND q.property_id=ANY(s.property_ids) AND 'reservation.manage'=ANY(s.permissions);
 IF actor IS NULL THEN RAISE EXCEPTION 'GUEST_QUOTE_STAFF_DENIED' USING ERRCODE='42501'; END IF;
 IF g.user_id IS NULL OR q.expires_at<=clock_timestamp() OR NOT EXISTS(
  SELECT 1 FROM public.users WHERE id=g.user_id AND status='active') OR NOT EXISTS(
  SELECT 1 FROM public.properties p JOIN public.units u ON u.property_id=p.id
  JOIN public.rate_plans r ON r.property_id=p.id AND r.unit_type_id=u.unit_type_id
  WHERE p.id=q.property_id AND p.organization_id=q.organization_id AND u.id=q.unit_id AND r.id=q.rate_plan_id
   AND p.status='active' AND u.status='active' AND r.active) THEN
  RAISE EXCEPTION 'GUEST_QUOTE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT * INTO offer FROM guest_identity_private.quote_offers WHERE quote_id=target;
 IF offer.quote_id IS NOT NULL THEN
  IF offer.profile_id<>profile OR offer.user_id<>g.user_id THEN RAISE EXCEPTION 'GUEST_QUOTE_CONFLICT' USING ERRCODE='23505'; END IF;
 ELSE
  INSERT INTO guest_identity_private.quote_offers VALUES(target,profile,g.user_id);
  INSERT INTO public.audit_log(organization_id,actor_user_id,actor_membership_id,action,entity_type,entity_id,after_state)
  VALUES(q.organization_id,actor.user_id,actor.membership_id,'guest_quote.issued','booking_quote',target,'{}');
 END IF;
 RETURN jsonb_build_object('quoteId',target,'expiresAt',q.expires_at);
END $$;
CREATE FUNCTION app.read_guest_quote(session_hash text,target uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE account_id uuid; result jsonb;
BEGIN
 SELECT guest_user_id INTO account_id FROM app.resolve_guest_identity(session_hash);
 IF account_id IS NULL THEN RAISE EXCEPTION 'GUEST_SESSION_INVALID' USING ERRCODE='28000'; END IF;
 SELECT jsonb_build_object('quoteId',q.id,'expiresAt',q.expires_at,'checkInAt',q.check_in_at,'checkOutAt',q.check_out_at,
  'currency',q.currency,'totalMinor',q.total_minor::text,'lines',COALESCE((
   SELECT jsonb_agg(jsonb_build_object('code',l.code,'label',l.label,'amountMinor',l.amount_minor::text,'currency',l.currency) ORDER BY l.sort_order,l.id)
   FROM public.booking_quote_lines l WHERE l.quote_id=q.id),'[]'::jsonb)) INTO result
 FROM guest_identity_private.quote_offers o JOIN public.booking_quotes q ON q.id=o.quote_id
 JOIN public.guest_profiles g ON g.id=o.profile_id AND g.organization_id=q.organization_id AND g.user_id=o.user_id
 JOIN public.properties p ON p.id=q.property_id AND p.organization_id=q.organization_id AND p.status='active'
 WHERE o.user_id=account_id AND q.id=target AND q.expires_at>statement_timestamp();
 IF result IS NULL THEN RAISE EXCEPTION 'GUEST_QUOTE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION app.issue_guest_quote(text,uuid,uuid),app.read_guest_quote(text,uuid) FROM PUBLIC;
COMMIT;
