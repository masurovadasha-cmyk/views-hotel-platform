BEGIN;
-- Local synthetic foundation. No onboarding, staff-role promotion or public table grants.
CREATE SCHEMA partner_private;
REVOKE ALL ON SCHEMA partner_private FROM PUBLIC;
CREATE TABLE partner_private.providers(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id),
 label text NOT NULL CHECK(length(label) BETWEEN 1 AND 80),active boolean NOT NULL DEFAULT false,
 UNIQUE(organization_id,id)
);
CREATE TABLE partner_private.principals(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),provider_id uuid NOT NULL REFERENCES partner_private.providers(id),active boolean NOT NULL DEFAULT false,
 UNIQUE(provider_id,id)
);
CREATE TABLE partner_private.grants(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,property_id uuid NOT NULL,provider_id uuid NOT NULL,service_id uuid NOT NULL,currency char(3) NOT NULL CHECK(currency='UZS'),
 active boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1 CHECK(version>0),
 FOREIGN KEY(organization_id,provider_id) REFERENCES partner_private.providers(organization_id,id),
 FOREIGN KEY(organization_id,property_id,service_id,currency) REFERENCES public.service_catalog(organization_id,property_id,id,currency),
 UNIQUE(provider_id,id),UNIQUE(organization_id,property_id,id)
);
CREATE TABLE partner_private.sessions(
 token_hash text PRIMARY KEY CHECK(token_hash ~ '^[a-f0-9]{64}$'),provider_id uuid NOT NULL,principal_id uuid NOT NULL,grant_id uuid NOT NULL,grant_version integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL,revoked_at timestamptz,
 FOREIGN KEY(provider_id,principal_id) REFERENCES partner_private.principals(provider_id,id),FOREIGN KEY(provider_id,grant_id) REFERENCES partner_private.grants(provider_id,id),
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '1 hour')
);
CREATE TABLE partner_private.assignments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,property_id uuid NOT NULL,order_id uuid NOT NULL,grant_id uuid NOT NULL,
 grant_version integer NOT NULL CHECK(grant_version>0),source_revision integer NOT NULL CHECK(source_revision>0),terms_version integer NOT NULL DEFAULT 1 CHECK(terms_version=1),
 status text NOT NULL DEFAULT 'offered' CHECK(status IN ('offered','accepted','rejected','withdrawn','expired')),revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 requested_for timestamptz NOT NULL,expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(organization_id,property_id,order_id) REFERENCES public.service_orders(organization_id,property_id,id),
 FOREIGN KEY(organization_id,property_id,grant_id) REFERENCES partner_private.grants(organization_id,property_id,id),
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '24 hours')
);
CREATE UNIQUE INDEX partner_assignment_active_order ON partner_private.assignments(order_id) WHERE status IN ('offered','accepted');
CREATE INDEX partner_assignment_grant_page ON partner_private.assignments(grant_id,id);
CREATE TABLE partner_private.commands(
 actor_kind text NOT NULL CHECK(actor_kind IN ('staff','partner')),actor_id uuid NOT NULL,command_key uuid NOT NULL,
 payload jsonb NOT NULL,assignment_id uuid REFERENCES partner_private.assignments(id),outcome text NOT NULL DEFAULT 'applied' CHECK(outcome IN ('applied','not_applied')),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(actor_kind,actor_id,command_key),CHECK((outcome='applied')=(assignment_id IS NOT NULL))
);
REVOKE ALL ON ALL TABLES IN SCHEMA partner_private FROM PUBLIC;

-- Revocation cannot be undone by toggling active back on; old sessions stay revoked.
CREATE FUNCTION partner_private.invalidate_access() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_TABLE_NAME='grants' THEN
  IF (NEW.organization_id,NEW.property_id,NEW.provider_id,NEW.service_id,NEW.currency) IS DISTINCT FROM (OLD.organization_id,OLD.property_id,OLD.provider_id,OLD.service_id,OLD.currency) THEN RAISE EXCEPTION 'PARTNER_SCOPE_IMMUTABLE' USING ERRCODE='23514'; END IF;
  IF NEW.active IS DISTINCT FROM OLD.active OR NEW.version IS DISTINCT FROM OLD.version THEN
   NEW.version:=OLD.version+1;UPDATE partner_private.sessions SET revoked_at=clock_timestamp() WHERE grant_id=OLD.id AND revoked_at IS NULL;
  END IF;
 ELSIF TG_TABLE_NAME='providers' THEN
  IF NEW.organization_id<>OLD.organization_id THEN RAISE EXCEPTION 'PARTNER_SCOPE_IMMUTABLE' USING ERRCODE='23514'; END IF;
  IF NEW.active IS DISTINCT FROM OLD.active THEN UPDATE partner_private.sessions SET revoked_at=clock_timestamp() WHERE provider_id=OLD.id AND revoked_at IS NULL;END IF;
 ELSE
  IF NEW.provider_id<>OLD.provider_id THEN RAISE EXCEPTION 'PARTNER_SCOPE_IMMUTABLE' USING ERRCODE='23514'; END IF;
  IF NEW.active IS DISTINCT FROM OLD.active THEN UPDATE partner_private.sessions SET revoked_at=clock_timestamp() WHERE principal_id=OLD.id AND revoked_at IS NULL;END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER partner_grant_revoke BEFORE UPDATE ON partner_private.grants FOR EACH ROW EXECUTE FUNCTION partner_private.invalidate_access();
CREATE TRIGGER partner_provider_revoke BEFORE UPDATE ON partner_private.providers FOR EACH ROW EXECUTE FUNCTION partner_private.invalidate_access();
CREATE TRIGGER partner_principal_revoke BEFORE UPDATE ON partner_private.principals FOR EACH ROW EXECUTE FUNCTION partner_private.invalidate_access();

CREATE FUNCTION partner_private.session_grant(session_hash text) RETURNS partner_private.grants
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE g partner_private.grants;
BEGIN
 SELECT x.* INTO g FROM partner_private.sessions s JOIN partner_private.grants x ON x.id=s.grant_id AND x.provider_id=s.provider_id
 JOIN partner_private.providers p ON p.id=x.provider_id AND p.organization_id=x.organization_id
 JOIN partner_private.principals u ON u.id=s.principal_id AND u.provider_id=p.id
 JOIN public.properties pr ON pr.id=x.property_id AND pr.organization_id=x.organization_id
 JOIN public.service_catalog c ON c.id=x.service_id AND c.organization_id=x.organization_id AND c.property_id=x.property_id
 WHERE s.token_hash=session_hash AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() AND s.grant_version=x.version
 AND x.active AND p.active AND u.active AND pr.status='active' AND c.active AND c.execution_kind='concierge';
 IF g.id IS NULL THEN RAISE EXCEPTION 'PARTNER_SESSION_REQUIRED' USING ERRCODE='28000'; END IF;
 RETURN g;
END $$;
CREATE FUNCTION partner_private.staff_authorize(session_hash text,org uuid,property uuid) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid;
BEGIN
 who:=service_private.staff_user(session_hash);
 IF NOT app.registry_access(org,property,'reservation.manage') OR NOT EXISTS(SELECT 1 FROM public.properties p WHERE p.id=property AND p.organization_id=org AND p.status='active') THEN RAISE EXCEPTION 'PARTNER_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 RETURN who;
END $$;
CREATE FUNCTION partner_private.receipt(a partner_private.assignments) RETURNS jsonb
LANGUAGE sql VOLATILE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('assignmentId',a.id,'kind','concierge','status',CASE WHEN a.status='offered' AND a.expires_at<=clock_timestamp() THEN 'expired' ELSE a.status END,
 'revision',a.revision,'termsVersion',a.terms_version,'requestedFor',a.requested_for,'expiresAt',a.expires_at,'synthetic',true)
$$;
CREATE FUNCTION partner_private.record(actor_kind text,actor_id uuid,key uuid,payload jsonb,a partner_private.assignments) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 INSERT INTO partner_private.commands(actor_kind,actor_id,command_key,payload,assignment_id) VALUES(actor_kind,actor_id,key,payload,a.id);
 INSERT INTO public.audit_log(organization_id,actor_user_id,actor_membership_id,action,entity_type,entity_id,after_state)
 VALUES(a.organization_id,CASE WHEN actor_kind='staff' THEN actor_id ELSE NULL END,CASE WHEN actor_kind='staff' THEN app.current_membership_id() ELSE NULL END,'partner.assignment.'||a.status,'partner_assignment',a.id,jsonb_build_object('status',a.status,'revision',a.revision,'synthetic',true));
 INSERT INTO public.outbox_events(organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload)
 VALUES(a.organization_id,'partner_assignment',a.id,'partner.assignment.'||a.status,'partner:'||actor_kind||':'||actor_id||':'||key,partner_private.receipt(a));
 RETURN partner_private.receipt(a)||jsonb_build_object('idempotentReplay',false,'outcome','applied','commandKey',key);
END $$;

CREATE FUNCTION app.partner_dispatch_list(session_hash text,property uuid,after_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE rows jsonb;
BEGIN
 PERFORM partner_private.staff_authorize(session_hash,app.current_organization_id(),property);
 SELECT coalesce(jsonb_agg(row_to_json(q) ORDER BY q."orderId"),'[]') INTO rows FROM (
 SELECT o.id AS "orderId",'concierge' AS kind,c.revision,o.requested_for AS "requestedFor",
 (SELECT coalesce(jsonb_agg(choices.item ORDER BY choices.id),'[]') FROM (SELECT g.id,jsonb_build_object('grantId',g.id,'label',p.label) item FROM partner_private.grants g JOIN partner_private.providers p ON p.id=g.provider_id
 WHERE g.organization_id=o.organization_id AND g.property_id=o.property_id AND g.service_id=o.service_id AND g.active AND p.active ORDER BY g.id LIMIT 50) choices) AS grants,
 EXISTS(SELECT 1 FROM partner_private.grants g JOIN partner_private.providers p ON p.id=g.provider_id WHERE g.organization_id=o.organization_id AND g.property_id=o.property_id AND g.service_id=o.service_id AND g.active AND p.active ORDER BY g.id OFFSET 50 LIMIT 1) AS "grantsTruncated"
 FROM public.service_orders o JOIN public.concierge_requests c ON c.order_id=o.id
 WHERE o.organization_id=app.current_organization_id() AND o.property_id=property AND o.status NOT IN ('completed','cancelled') AND c.stage NOT IN ('closed','cancelled') AND (after_id IS NULL OR o.id>after_id)
 ORDER BY o.id LIMIT 21) q;
 PERFORM partner_private.staff_authorize(session_hash,app.current_organization_id(),property);
 RETURN jsonb_build_object('items',CASE WHEN jsonb_array_length(rows)>20 THEN rows-20 ELSE rows END,'nextCursor',CASE WHEN jsonb_array_length(rows)>20 THEN rows->19->>'orderId' ELSE NULL END);
END $$;

CREATE FUNCTION app.partner_offer(session_hash text,key uuid,body jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o public.service_orders;c public.concierge_requests;g partner_private.grants;a partner_private.assignments;prior partner_private.commands;who uuid;expiry timestamptz;result jsonb;recovery boolean:=body->'recoveryOnly'='true'::jsonb;
BEGIN
 IF body ? 'recoveryOnly' AND body->'recoveryOnly' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'PARTNER_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 body:=body-'recoveryOnly';
 IF key IS NULL OR jsonb_typeof(body) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM ARRAY['expectedOrderRevision','expiresAt','grantId','orderId']
 OR jsonb_typeof(body->'expectedOrderRevision') IS DISTINCT FROM 'number' OR body->>'expectedOrderRevision' !~ '^[1-9][0-9]{0,8}$' THEN RAISE EXCEPTION 'PARTNER_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 SELECT * INTO o FROM public.service_orders WHERE id=(body->>'orderId')::uuid;
 IF o.id IS NULL THEN RAISE EXCEPTION 'PARTNER_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 who:=partner_private.staff_authorize(session_hash,o.organization_id,o.property_id);
 PERFORM pg_advisory_xact_lock(hashtextextended('partner:staff:'||who||':'||key,0));
 -- Same source lock as concierge; neither its state nor staff assignment is modified.
 SELECT * INTO c FROM public.concierge_requests WHERE order_id=o.id FOR UPDATE;
 IF c.order_id IS NULL THEN RAISE EXCEPTION 'PARTNER_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 PERFORM partner_private.staff_authorize(session_hash,o.organization_id,o.property_id);
 SELECT * INTO g FROM partner_private.grants WHERE id=(body->>'grantId')::uuid AND organization_id=o.organization_id AND property_id=o.property_id AND service_id=o.service_id AND active;
 IF g.id IS NULL OR NOT EXISTS(SELECT 1 FROM partner_private.providers WHERE id=g.provider_id AND active) OR NOT EXISTS(SELECT 1 FROM public.service_catalog WHERE id=g.service_id AND active AND execution_kind='concierge') THEN RAISE EXCEPTION 'PARTNER_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT * INTO prior FROM partner_private.commands WHERE actor_kind='staff' AND actor_id=who AND command_key=key;
 IF prior.command_key IS NOT NULL THEN
  IF prior.payload IS DISTINCT FROM body THEN RAISE EXCEPTION 'PARTNER_IDEMPOTENCY_CONFLICT' USING ERRCODE='23514'; END IF;
  IF prior.outcome='not_applied' THEN RETURN jsonb_build_object('outcome','not_applied','assignmentId',NULL,'synthetic',true,'idempotentReplay',true,'commandKey',key); END IF;
  SELECT * INTO a FROM partner_private.assignments WHERE id=prior.assignment_id;
  PERFORM partner_private.staff_authorize(session_hash,o.organization_id,o.property_id);
  IF prior.outcome='not_applied' THEN RETURN jsonb_build_object('outcome','not_applied','assignmentId',NULL,'synthetic',true,'idempotentReplay',true,'commandKey',key); END IF;
  RETURN partner_private.receipt(a)||jsonb_build_object('idempotentReplay',true,'outcome','applied','commandKey',key);
 END IF;
 IF recovery THEN
  INSERT INTO partner_private.commands(actor_kind,actor_id,command_key,payload,outcome) VALUES('staff',who,key,body,'not_applied');
  PERFORM partner_private.staff_authorize(session_hash,o.organization_id,o.property_id);
  RETURN jsonb_build_object('outcome','not_applied','assignmentId',NULL,'synthetic',true,'idempotentReplay',false,'commandKey',key);
 END IF;
 IF c.revision<>(body->>'expectedOrderRevision')::integer THEN RAISE EXCEPTION 'PARTNER_REVISION_CHANGED' USING ERRCODE='23514'; END IF;
 IF c.stage IN ('closed','cancelled') OR EXISTS(SELECT 1 FROM public.service_orders WHERE id=o.id AND status IN ('completed','cancelled')) THEN RAISE EXCEPTION 'PARTNER_TRANSITION_INVALID' USING ERRCODE='23514'; END IF;
 expiry:=(body->>'expiresAt')::timestamptz;
 IF expiry IS NULL OR expiry<=clock_timestamp() OR expiry>clock_timestamp()+interval '24 hours' THEN RAISE EXCEPTION 'PARTNER_EXPIRED' USING ERRCODE='23514'; END IF;
 UPDATE partner_private.assignments SET status='expired',revision=revision+1 WHERE order_id=o.id AND status='offered' AND expires_at<=clock_timestamp();
 IF EXISTS(SELECT 1 FROM partner_private.assignments WHERE order_id=o.id AND status IN ('offered','accepted')) THEN RAISE EXCEPTION 'PARTNER_ALREADY_ASSIGNED' USING ERRCODE='23514'; END IF;
 INSERT INTO partner_private.assignments(organization_id,property_id,order_id,grant_id,grant_version,source_revision,requested_for,expires_at)
 VALUES(o.organization_id,o.property_id,o.id,g.id,g.version,c.revision,o.requested_for,expiry) RETURNING * INTO a;
 PERFORM partner_private.staff_authorize(session_hash,o.organization_id,o.property_id);
 result:=partner_private.record('staff',who,key,body,a);
 PERFORM partner_private.staff_authorize(session_hash,o.organization_id,o.property_id);
 IF NOT EXISTS(SELECT 1 FROM partner_private.grants x JOIN partner_private.providers p ON p.id=x.provider_id JOIN public.service_catalog catalog ON catalog.id=x.service_id WHERE x.id=g.id AND x.active AND x.version=g.version AND p.active AND catalog.active AND catalog.execution_kind='concierge') THEN RAISE EXCEPTION 'PARTNER_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 RETURN result;
END $$;

CREATE FUNCTION app.partner_assignment_list(session_hash text,after_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE g partner_private.grants;rows jsonb;
BEGIN
 g:=partner_private.session_grant(session_hash);
 SELECT coalesce(jsonb_agg(partner_private.receipt(q) ORDER BY q.id),'[]') INTO rows FROM (
 SELECT a.* FROM partner_private.assignments a WHERE a.grant_id=g.id AND a.grant_version=g.version AND (after_id IS NULL OR a.id>after_id) ORDER BY a.id LIMIT 21) q;
 PERFORM partner_private.session_grant(session_hash);
 RETURN jsonb_build_object('items',CASE WHEN jsonb_array_length(rows)>20 THEN rows-20 ELSE rows END,'nextCursor',CASE WHEN jsonb_array_length(rows)>20 THEN rows->19->>'assignmentId' ELSE NULL END);
END $$;
CREATE FUNCTION app.partner_decide(session_hash text,assignment uuid,key uuid,body jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE g partner_private.grants;a partner_private.assignments;c public.concierge_requests;prior partner_private.commands;who uuid;payload jsonb;result jsonb;recovery boolean:=body->'recoveryOnly'='true'::jsonb;
BEGIN
 g:=partner_private.session_grant(session_hash);
 IF body ? 'recoveryOnly' AND body->'recoveryOnly' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'PARTNER_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 body:=body-'recoveryOnly';
 IF key IS NULL OR jsonb_typeof(body) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM ARRAY['action','expectedRevision','termsVersion']
 OR body->>'action' NOT IN ('accept','reject') OR body->>'action' IS NULL OR jsonb_typeof(body->'expectedRevision') IS DISTINCT FROM 'number' OR body->>'expectedRevision' !~ '^[1-9][0-9]{0,8}$' OR body->'termsVersion' IS DISTINCT FROM '1'::jsonb THEN RAISE EXCEPTION 'PARTNER_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 SELECT principal_id INTO who FROM partner_private.sessions WHERE token_hash=session_hash;
 payload:=jsonb_build_object('assignmentId',assignment,'grantId',g.id,'body',body);
 PERFORM pg_advisory_xact_lock(hashtextextended('partner:partner:'||who||':'||key,0));
 SELECT * INTO a FROM partner_private.assignments WHERE id=assignment AND grant_id=g.id AND grant_version=g.version;
 IF a.id IS NULL THEN RAISE EXCEPTION 'PARTNER_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 -- Canonical order: source first, assignment second. Re-authorize after both waits.
 SELECT * INTO c FROM public.concierge_requests WHERE order_id=a.order_id FOR UPDATE;
 SELECT * INTO a FROM partner_private.assignments WHERE id=assignment FOR UPDATE;
 PERFORM partner_private.session_grant(session_hash);
 IF a.grant_id<>g.id OR a.grant_version<>g.version THEN RAISE EXCEPTION 'PARTNER_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT * INTO prior FROM partner_private.commands WHERE actor_kind='partner' AND actor_id=who AND command_key=key;
 IF prior.command_key IS NOT NULL THEN
  IF prior.payload IS DISTINCT FROM payload THEN RAISE EXCEPTION 'PARTNER_IDEMPOTENCY_CONFLICT' USING ERRCODE='23514'; END IF;
  PERFORM partner_private.session_grant(session_hash);
  IF prior.outcome='not_applied' THEN RETURN jsonb_build_object('outcome','not_applied','assignmentId',NULL,'synthetic',true,'idempotentReplay',true,'commandKey',key); END IF;
  RETURN partner_private.receipt(a)||jsonb_build_object('idempotentReplay',true,'outcome','applied','commandKey',key);
 END IF;
 IF recovery THEN
  INSERT INTO partner_private.commands(actor_kind,actor_id,command_key,payload,outcome) VALUES('partner',who,key,payload,'not_applied');
  PERFORM partner_private.session_grant(session_hash);
  RETURN jsonb_build_object('outcome','not_applied','assignmentId',NULL,'synthetic',true,'idempotentReplay',false,'commandKey',key);
 END IF;
 IF a.revision<>(body->>'expectedRevision')::integer THEN RAISE EXCEPTION 'PARTNER_REVISION_CHANGED' USING ERRCODE='23514'; END IF;
 IF a.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'PARTNER_EXPIRED' USING ERRCODE='23514'; END IF;
 IF a.status<>'offered' OR c.stage IN ('closed','cancelled') OR EXISTS(SELECT 1 FROM public.service_orders WHERE id=a.order_id AND status IN ('completed','cancelled')) THEN RAISE EXCEPTION 'PARTNER_TRANSITION_INVALID' USING ERRCODE='23514'; END IF;
 IF c.revision<>a.source_revision THEN RAISE EXCEPTION 'PARTNER_REVISION_CHANGED' USING ERRCODE='23514'; END IF;
 UPDATE partner_private.assignments SET status=CASE WHEN body->>'action'='accept' THEN 'accepted' ELSE 'rejected' END,revision=revision+1 WHERE id=a.id RETURNING * INTO a;
 PERFORM partner_private.session_grant(session_hash);
 result:=partner_private.record('partner',who,key,payload,a);
 PERFORM partner_private.session_grant(session_hash);
 RETURN result;
END $$;
CREATE FUNCTION app.partner_session(session_hash text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE g partner_private.grants;result jsonb;
BEGIN
 g:=partner_private.session_grant(session_hash);
 SELECT jsonb_build_object('principalId',principal_id,'grantId',g.id,'expiresAt',expires_at,'synthetic',true) INTO result FROM partner_private.sessions WHERE token_hash=session_hash;
 PERFORM partner_private.session_grant(session_hash);RETURN result;
END $$;
REVOKE ALL ON FUNCTION app.partner_session(text) FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA partner_private FROM PUBLIC;
REVOKE ALL ON FUNCTION app.partner_dispatch_list(text,uuid,uuid),app.partner_offer(text,uuid,jsonb),app.partner_assignment_list(text,uuid),app.partner_decide(text,uuid,uuid,jsonb) FROM PUBLIC;
COMMIT;
