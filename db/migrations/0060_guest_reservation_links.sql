BEGIN;
CREATE TABLE guest_identity_private.reservation_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id),
 reservation_id uuid NOT NULL REFERENCES public.reservations(id), guest_profile_id uuid NOT NULL REFERENCES public.guest_profiles(id),
 recipient_email text NOT NULL CHECK(recipient_email=lower(recipient_email)), token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 issued_by uuid NOT NULL REFERENCES public.organization_memberships(id), command_key uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '1 hour',
 accepted_by uuid REFERENCES public.users(id), accepted_at timestamptz, revoked_at timestamptz,
 UNIQUE(organization_id,command_key), CHECK((accepted_by IS NULL)=(accepted_at IS NULL))
);
CREATE UNIQUE INDEX guest_link_one_owner_idx ON guest_identity_private.reservation_links(reservation_id) WHERE accepted_at IS NOT NULL AND revoked_at IS NULL;
CREATE INDEX guest_link_account_idx ON guest_identity_private.reservation_links(accepted_by,reservation_id) WHERE revoked_at IS NULL;
CREATE INDEX guest_link_reservation_idx ON guest_identity_private.reservation_links(reservation_id,created_at);
ALTER TABLE guest_identity_private.reservation_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_identity_private.reservation_links FORCE ROW LEVEL SECURITY;
REVOKE ALL ON guest_identity_private.reservation_links FROM PUBLIC;
-- Fresh staff session, current permissions and property scope; no caller-supplied actor.
CREATE FUNCTION guest_identity_private.link_staff(staff_hash text,target uuid)
RETURNS TABLE(org uuid,actor uuid,member uuid) LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT s.organization_id,s.user_id,s.membership_id FROM app.staff_auth_resolve(staff_hash) s
 JOIN public.reservations r ON r.id=target AND r.organization_id=s.organization_id
 JOIN public.properties p ON p.id=r.property_id AND p.organization_id=r.organization_id
 WHERE 'reservation.manage'=ANY(s.permissions) AND r.property_id=ANY(s.property_ids)
$$;
REVOKE ALL ON FUNCTION guest_identity_private.link_staff(text,uuid) FROM PUBLIC;
CREATE FUNCTION app.issue_guest_reservation_link(staff_hash text,target uuid,address text,digest text,command uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor record; r public.reservations; g public.guest_profiles; link guest_identity_private.reservation_links;
BEGIN
 SELECT * INTO actor FROM guest_identity_private.link_staff(staff_hash,target);
 IF actor.member IS NULL THEN RAISE EXCEPTION 'GUEST_LINK_STAFF_DENIED' USING ERRCODE='42501'; END IF;
 IF address IS NULL OR length(address)>254 OR address<>lower(address) OR digest IS NULL OR digest !~ '^[a-f0-9]{64}$' OR command IS NULL THEN RAISE EXCEPTION 'GUEST_LINK_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 -- Serialize command reuse across reservations, then reservation/profile/link in that order.
 PERFORM pg_advisory_xact_lock(hashtextextended('guest-link:'||actor.org::text||':'||command::text,0));
 SELECT * INTO r FROM public.reservations WHERE id=target FOR UPDATE;
 SELECT * INTO g FROM public.guest_profiles WHERE id=r.primary_guest_id AND organization_id=r.organization_id FOR UPDATE;
 SELECT * INTO link FROM guest_identity_private.reservation_links WHERE organization_id=actor.org AND command_key=command;
 IF link.id IS NOT NULL THEN
  IF link.reservation_id<>target OR link.recipient_email<>address OR link.token_hash<>digest OR link.issued_by<>actor.member THEN RAISE EXCEPTION 'GUEST_LINK_COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
  IF link.revoked_at IS NOT NULL OR link.accepted_at IS NOT NULL OR link.expires_at<=clock_timestamp() OR link.guest_profile_id IS DISTINCT FROM g.id OR g.user_id IS NOT NULL OR r.status NOT IN ('confirmed','checked_in','checked_out') THEN RAISE EXCEPTION 'GUEST_LINK_INACTIVE' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object('linkId',link.id,'reservationId',r.id,'expiresAt',link.expires_at,'replayed',true);
 END IF;
 IF g.id IS NULL OR g.user_id IS NOT NULL OR r.status NOT IN ('confirmed','checked_in','checked_out') OR EXISTS(
  SELECT 1 FROM guest_identity_private.reservation_links WHERE reservation_id=target AND accepted_at IS NOT NULL AND revoked_at IS NULL) THEN RAISE EXCEPTION 'GUEST_LINK_NOT_ELIGIBLE' USING ERRCODE='22023'; END IF;
 WITH superseded AS (UPDATE guest_identity_private.reservation_links SET revoked_at=clock_timestamp() WHERE reservation_id=target AND revoked_at IS NULL RETURNING id)
 INSERT INTO public.audit_log(organization_id,actor_user_id,actor_membership_id,action,entity_type,entity_id,after_state)
 SELECT actor.org,actor.actor,actor.member,'guest_link.revoked','reservation',target,jsonb_build_object('linkId',id,'reason','superseded') FROM superseded;
 INSERT INTO guest_identity_private.reservation_links(organization_id,reservation_id,guest_profile_id,recipient_email,token_hash,issued_by,command_key)
 VALUES(actor.org,target,g.id,address,digest,actor.member,command) RETURNING * INTO link;
 INSERT INTO public.audit_log(organization_id,actor_user_id,actor_membership_id,action,entity_type,entity_id,after_state)
 VALUES(actor.org,actor.actor,actor.member,'guest_link.issued','reservation',target,jsonb_build_object('linkId',link.id));
 RETURN jsonb_build_object('linkId',link.id,'reservationId',r.id,'expiresAt',link.expires_at,'replayed',false);
END $$;
CREATE FUNCTION app.revoke_guest_reservation_link(staff_hash text,target uuid,link_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor record; changed uuid; was_accepted boolean;
BEGIN
 SELECT * INTO actor FROM guest_identity_private.link_staff(staff_hash,target);
 IF actor.member IS NULL THEN RAISE EXCEPTION 'GUEST_LINK_STAFF_DENIED' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.reservations WHERE id=target FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM guest_identity_private.reservation_links WHERE id=link_id AND reservation_id=target AND organization_id=actor.org) THEN RAISE EXCEPTION 'GUEST_LINK_INVALID' USING ERRCODE='22023'; END IF;
 UPDATE guest_identity_private.reservation_links SET revoked_at=clock_timestamp() WHERE id=link_id AND revoked_at IS NULL RETURNING id,accepted_at IS NOT NULL INTO changed,was_accepted;
 IF changed IS NOT NULL THEN
  INSERT INTO public.audit_log(organization_id,actor_user_id,actor_membership_id,action,entity_type,entity_id,after_state)
  VALUES(actor.org,actor.actor,actor.member,'guest_link.revoked','reservation',target,jsonb_build_object('linkId',link_id));
  IF was_accepted THEN
   INSERT INTO public.outbox_events(organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload)
   VALUES(actor.org,'reservation',target,'guest.reservation_unlinked','guest-link-revoked:'||link_id::text,jsonb_build_object('linkId',link_id,'reservationId',target));
  END IF;
 END IF;
 RETURN true;
END $$;
CREATE FUNCTION app.inspect_guest_reservation_link(staff_hash text,target uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor record; result jsonb;
BEGIN
 SELECT * INTO actor FROM guest_identity_private.link_staff(staff_hash,target);
 IF actor.member IS NULL THEN RAISE EXCEPTION 'GUEST_LINK_STAFF_DENIED' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('linkId',id,'recipientEmail',recipient_email,'expiresAt',expires_at,'status',
  CASE WHEN revoked_at IS NOT NULL THEN 'revoked' WHEN accepted_at IS NOT NULL THEN 'accepted' WHEN expires_at<=clock_timestamp() THEN 'expired' ELSE 'pending' END)
 INTO result FROM guest_identity_private.reservation_links WHERE reservation_id=target AND organization_id=actor.org ORDER BY (revoked_at IS NULL) DESC,created_at DESC,id DESC LIMIT 1;
 RETURN jsonb_build_object('invitation',result);
END $$;
REVOKE ALL ON FUNCTION app.inspect_guest_reservation_link(text,uuid) FROM PUBLIC;
CREATE FUNCTION app.use_guest_reservation_link(session_hash text,digest text,accept_link boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE account record; link guest_identity_private.reservation_links; r public.reservations; g public.guest_profiles; p public.properties;
BEGIN
 SELECT * INTO account FROM app.resolve_guest_email_identity(session_hash);
 IF account.guest_user_id IS NULL THEN RAISE EXCEPTION 'GUEST_EMAIL_SESSION_INVALID' USING ERRCODE='28000'; END IF;
 SELECT * INTO link FROM guest_identity_private.reservation_links WHERE token_hash=digest;
 IF link.id IS NULL THEN RAISE EXCEPTION 'GUEST_LINK_INVALID' USING ERRCODE='22023'; END IF;
 SELECT * INTO r FROM public.reservations WHERE id=link.reservation_id FOR UPDATE;
 SELECT * INTO g FROM public.guest_profiles WHERE id=r.primary_guest_id FOR UPDATE;
 SELECT * INTO link FROM guest_identity_private.reservation_links WHERE token_hash=digest FOR UPDATE;
 SELECT * INTO p FROM public.properties WHERE id=r.property_id AND organization_id=r.organization_id;
 IF link.revoked_at IS NOT NULL OR link.recipient_email<>account.guest_email OR link.organization_id<>r.organization_id
  OR link.guest_profile_id IS DISTINCT FROM g.id OR g.organization_id<>r.organization_id OR p.id IS NULL
  OR (g.user_id IS NOT NULL AND g.user_id<>account.guest_user_id)
  OR (link.accepted_by IS NOT NULL AND link.accepted_by<>account.guest_user_id)
  OR (link.accepted_at IS NULL AND (link.expires_at<=clock_timestamp() OR r.status NOT IN ('confirmed','checked_in','checked_out'))) THEN
  RAISE EXCEPTION 'GUEST_LINK_INVALID' USING ERRCODE='22023';
 END IF;
 IF accept_link AND link.accepted_at IS NULL THEN
  UPDATE guest_identity_private.reservation_links SET accepted_by=account.guest_user_id,accepted_at=clock_timestamp() WHERE id=link.id;
  INSERT INTO public.audit_log(organization_id,actor_user_id,action,entity_type,entity_id,after_state)
  VALUES(r.organization_id,account.guest_user_id,'guest_link.accepted','reservation',r.id,jsonb_build_object('linkId',link.id));
  INSERT INTO public.outbox_events(organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload)
  VALUES(r.organization_id,'reservation',r.id,'guest.reservation_linked','guest-link:'||link.id::text,jsonb_build_object('linkId',link.id,'reservationId',r.id));
 END IF;
 RETURN jsonb_build_object('reservationId',r.id,'confirmationCode',r.confirmation_code,'propertyName',jsonb_strip_nulls(jsonb_build_object('ru',p.name->>'ru','uz',p.name->>'uz','en',p.name->>'en')),
  'checkInAt',r.check_in_at,'checkOutAt',r.check_out_at,'timezone',p.timezone,'accepted',accept_link OR link.accepted_at IS NOT NULL);
END $$;
REVOKE ALL ON FUNCTION app.issue_guest_reservation_link(text,uuid,text,text,uuid),app.revoke_guest_reservation_link(text,uuid,uuid),app.use_guest_reservation_link(text,text,boolean) FROM PUBLIC;
COMMIT;
