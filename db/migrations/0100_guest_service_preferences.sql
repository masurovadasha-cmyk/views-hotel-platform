BEGIN;
CREATE TABLE reservation_service_preferences (
 reservation_id uuid PRIMARY KEY,organization_id uuid NOT NULL,property_id uuid NOT NULL,currency char(3) NOT NULL,user_id uuid NOT NULL REFERENCES users(id),
 consent boolean NOT NULL,preferences text NOT NULL CHECK(length(preferences)<=500 AND preferences !~ '[[:cntrl:]]'),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(consent OR preferences=''),
 FOREIGN KEY(organization_id,property_id,reservation_id,currency) REFERENCES reservations(organization_id,property_id,id,currency)
);
ALTER TABLE reservation_service_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_service_preferences FORCE ROW LEVEL SECURITY;
-- No direct runtime read/write policy: ownership and task assignment are verified in the narrow functions.
CREATE FUNCTION app.concierge_preferences(session_hash text,reservation uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid:=service_private.guest_user(session_hash);r public.reservation_service_preferences;
BEGIN
 PERFORM 1 FROM public.reservations s JOIN public.guest_profiles g ON g.id=s.primary_guest_id AND g.organization_id=s.organization_id WHERE s.id=reservation AND g.user_id=who;
 IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002';END IF;
 SELECT * INTO r FROM public.reservation_service_preferences WHERE reservation_id=reservation;
 RETURN jsonb_build_object('reservationId',reservation,'revision',coalesce(r.revision,0),'consent',coalesce(r.user_id=who AND r.consent,false),'preferences',CASE WHEN r.user_id=who AND r.consent THEN r.preferences ELSE '' END);
END $$;
CREATE FUNCTION app.concierge_preferences_save(session_hash text,key uuid,body jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid:=service_private.guest_user(session_hash);stay public.reservations;old public.reservation_service_preferences;result jsonb;prior jsonb;reservation uuid;
 -- Hash the body: preference text must not survive revocation in command results or audit/outbox.
 payload jsonb:=jsonb_build_object('kind','preferences_save','bodyHash',encode(sha256(convert_to(body::text,'UTF8')),'hex'));
BEGIN
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM ARRAY['consent','expectedRevision','preferences','reservationId']
 OR jsonb_typeof(body->'expectedRevision') IS DISTINCT FROM 'number' OR body->>'expectedRevision' !~ '^(0|[1-9][0-9]*)$' OR jsonb_typeof(body->'consent') IS DISTINCT FROM 'boolean'
 OR jsonb_typeof(body->'preferences') IS DISTINCT FROM 'string' OR length(body->>'preferences')>500 OR body->>'preferences' ~ '[[:cntrl:]]'
 OR body->>'consent'='false' AND body->>'preferences'<>'' THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023';END IF;
 reservation:=(body->>'reservationId')::uuid;
 PERFORM 1 FROM public.reservations s JOIN public.guest_profiles g ON g.id=s.primary_guest_id AND g.organization_id=s.organization_id WHERE s.id=reservation AND g.user_id=who;
 IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('service:'||who||':'||key,0));
 SELECT s.* INTO stay FROM public.reservations s JOIN public.guest_profiles g ON g.id=s.primary_guest_id AND g.organization_id=s.organization_id WHERE s.id=reservation AND g.user_id=who FOR UPDATE OF s FOR SHARE OF g;
 PERFORM service_private.guest_user(session_hash);
 IF stay.id IS NULL THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002';END IF;
 prior:=service_private.service_command_replay(who,key,payload);IF prior IS NOT NULL THEN RETURN prior;END IF;
 IF body->>'consent'='true' AND stay.status<>'checked_in' THEN RAISE EXCEPTION 'SERVICE_STAY_INELIGIBLE' USING ERRCODE='23514';END IF;
 SELECT * INTO old FROM public.reservation_service_preferences WHERE reservation_id=reservation FOR UPDATE;
 IF coalesce(old.revision,0) IS DISTINCT FROM (body->>'expectedRevision')::integer THEN RAISE EXCEPTION 'SERVICE_REVISION_CHANGED' USING ERRCODE='23514';END IF;
 INSERT INTO public.reservation_service_preferences(reservation_id,organization_id,property_id,currency,user_id,consent,preferences) VALUES(reservation,stay.organization_id,stay.property_id,stay.currency,who,(body->>'consent')::boolean,btrim(body->>'preferences'))
 ON CONFLICT(reservation_id) DO UPDATE SET user_id=who,consent=excluded.consent,preferences=excluded.preferences,revision=public.reservation_service_preferences.revision+1,updated_at=clock_timestamp();
 SELECT jsonb_build_object('reservationId',reservation,'revision',revision,'consent',consent,'idempotentReplay',false) INTO result FROM public.reservation_service_preferences WHERE reservation_id=reservation;
 INSERT INTO service_private.commands(actor_user_id,command_key,payload,result) VALUES(who,key,payload,result);
 INSERT INTO public.audit_log(organization_id,actor_user_id,action,entity_type,entity_id,after_state) VALUES(stay.organization_id,who,'preferences.updated','reservation',reservation,result);
 INSERT INTO public.outbox_events(organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload) VALUES(stay.organization_id,'reservation',reservation,'preferences.updated','service-command:'||who||':'||key,result);
 RETURN result;
END $$;
CREATE FUNCTION app.concierge_guest_context(session_hash text,oid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid:=service_private.staff_user(session_hash);task public.concierge_requests;result jsonb;
BEGIN
 SELECT * INTO task FROM public.concierge_requests WHERE order_id=oid;
 IF task.order_id IS NULL THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002';END IF;
 IF NOT app.registry_access(task.organization_id,task.property_id,'guest.read') OR NOT coalesce((app.registry_access(task.organization_id,task.property_id,'reservation.manage') OR task.assigned_membership_id=app.current_membership_id() AND app.registry_access(task.organization_id,task.property_id,'concierge.work')),false) THEN RAISE EXCEPTION 'SERVICE_FORBIDDEN' USING ERRCODE='42501';END IF;
 SELECT jsonb_build_object('reservationId',r.id,'guestName',left(concat_ws(' ',g.first_name,g.last_name),200),'confirmationCode',left(r.confirmation_code,80),'unitCode',left(u.code,128),
 'consent',coalesce(p.consent AND p.user_id=g.user_id AND r.status='checked_in',false),'preferences',CASE WHEN p.consent AND p.user_id=g.user_id AND r.status='checked_in' THEN p.preferences ELSE '' END)
 INTO result FROM public.service_orders o JOIN public.reservations r ON r.id=o.reservation_id JOIN public.guest_profiles g ON g.id=r.primary_guest_id AND g.organization_id=r.organization_id LEFT JOIN public.units u ON u.id=r.unit_id AND u.property_id=r.property_id LEFT JOIN public.reservation_service_preferences p ON p.reservation_id=r.id WHERE o.id=oid;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION app.concierge_preferences(text,uuid),app.concierge_preferences_save(text,uuid,jsonb),app.concierge_guest_context(text,uuid) FROM PUBLIC;
COMMIT;
