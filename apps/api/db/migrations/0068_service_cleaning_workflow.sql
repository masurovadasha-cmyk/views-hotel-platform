BEGIN;
-- Opt-in execution metadata; existing catalog rows remain ineligible.
ALTER TABLE service_catalog ADD COLUMN execution_kind text CHECK(execution_kind IN ('cleaning'));
ALTER TABLE service_catalog ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision>0);
ALTER TABLE service_catalog ADD COLUMN duration_minutes integer CHECK(duration_minutes BETWEEN 5 AND 480);
ALTER TABLE service_catalog ADD CONSTRAINT cleaning_catalog_duration CHECK(execution_kind IS DISTINCT FROM 'cleaning' OR duration_minutes IS NOT NULL);
CREATE FUNCTION app.service_catalog_revision() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.id<>OLD.id OR NEW.organization_id<>OLD.organization_id OR NEW.property_id<>OLD.property_id OR NEW.currency<>OLD.currency THEN RAISE EXCEPTION 'SERVICE_CATALOG_IDENTITY_IMMUTABLE' USING ERRCODE='23514'; END IF;
 NEW.revision:=OLD.revision+1; RETURN NEW;
END $$;
CREATE TRIGGER service_catalog_revision BEFORE UPDATE ON service_catalog FOR EACH ROW EXECUTE FUNCTION app.service_catalog_revision();
ALTER TABLE service_orders ADD CONSTRAINT service_orders_scope_unique UNIQUE(organization_id,property_id,id);
CREATE TABLE service_cleaning_tasks (
 order_id uuid PRIMARY KEY, organization_id uuid NOT NULL, property_id uuid NOT NULL,
 scheduled_period tstzrange NOT NULL CHECK(NOT isempty(scheduled_period) AND lower(scheduled_period) IS NOT NULL AND upper(scheduled_period) IS NOT NULL AND lower_inc(scheduled_period) AND NOT upper_inc(scheduled_period)),
 stage text NOT NULL DEFAULT 'requested' CHECK(stage IN ('requested','assigned','working','inspection','rework','done','cancelled')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 assigned_membership_id uuid REFERENCES organization_memberships(id),
 checklist jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(checklist)='object'),
 completion_note text, inspection_note text, inspected_by uuid REFERENCES users(id),
 folio_entry_id uuid REFERENCES folio_entries(id), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(organization_id,property_id,order_id) REFERENCES service_orders(organization_id,property_id,id),
 CHECK(stage IN ('requested','cancelled') OR assigned_membership_id IS NOT NULL),
 CHECK((stage='done')=(inspected_by IS NOT NULL AND folio_entry_id IS NOT NULL))
);
ALTER TABLE service_cleaning_tasks ADD CONSTRAINT service_cleaning_no_assignment_overlap EXCLUDE USING gist(assigned_membership_id WITH =,scheduled_period WITH &&) WHERE(stage IN ('assigned','working','inspection','rework'));
CREATE INDEX service_cleaning_queue_idx ON service_cleaning_tasks(organization_id,property_id,stage,order_id);
CREATE INDEX service_cleaning_assignee_idx ON service_cleaning_tasks(assigned_membership_id,stage,order_id);
ALTER TABLE service_cleaning_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_cleaning_tasks FORCE ROW LEVEL SECURITY;
CREATE POLICY cleaning_read ON service_cleaning_tasks FOR SELECT USING(
 app.registry_access(organization_id,property_id,'reservation.read') OR
 assigned_membership_id=app.current_membership_id() AND app.registry_access(organization_id,property_id,'housekeeping.work'));
-- All mutations are through narrow authenticated functions; no runtime write policy.
CREATE SCHEMA service_private;
REVOKE ALL ON SCHEMA service_private FROM PUBLIC;
CREATE TABLE service_private.commands (
 actor_user_id uuid NOT NULL REFERENCES public.users(id), command_key uuid NOT NULL,
 payload jsonb NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(actor_user_id,command_key)
);
REVOKE ALL ON ALL TABLES IN SCHEMA service_private FROM PUBLIC;
CREATE FUNCTION app.service_command_replay(who uuid,key uuid,body jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prior service_private.commands;
BEGIN
 IF who IS NULL OR key IS NULL OR body IS NULL THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('service:'||who||':'||key,0));
 SELECT * INTO prior FROM service_private.commands WHERE actor_user_id=who AND command_key=key;
 IF prior.actor_user_id IS NULL THEN RETURN NULL; END IF;
 IF prior.payload IS DISTINCT FROM body THEN RAISE EXCEPTION 'SERVICE_COMMAND_CONFLICT' USING ERRCODE='23514'; END IF;
 RETURN prior.result||'{"idempotentReplay":true}'::jsonb;
END $$;
CREATE FUNCTION app.service_command_record(who uuid,mid uuid,key uuid,body jsonb,result jsonb,org uuid,oid uuid,event text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 INSERT INTO service_private.commands(actor_user_id,command_key,payload,result) VALUES(who,key,body,result);
 INSERT INTO public.audit_log(organization_id,actor_user_id,actor_membership_id,action,entity_type,entity_id,after_state)
 VALUES(org,who,mid,event,'service_order',oid,result);
 INSERT INTO public.outbox_events(organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload)
 VALUES(org,'service_order',oid,event,'service-command:'||who||':'||key,result);
END $$;
-- Helpers are private even when deployments grant EXECUTE on app functions.
ALTER FUNCTION app.service_command_replay(uuid,uuid,jsonb) SET SCHEMA service_private;
ALTER FUNCTION app.service_command_record(uuid,uuid,uuid,jsonb,jsonb,uuid,uuid,text) SET SCHEMA service_private;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA service_private FROM PUBLIC;
CREATE FUNCTION service_private.guest_user(session_hash text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid;
BEGIN
 SELECT u.id INTO who FROM guest_identity_private.email_sessions s JOIN public.users u ON u.id=s.user_id
 WHERE s.token_hash=session_hash AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() AND u.status='active' AND lower(u.email)=s.verified_email;
 IF who IS NULL THEN RAISE EXCEPTION 'SERVICE_SESSION_INVALID' USING ERRCODE='28000'; END IF; RETURN who;
END $$;
CREATE FUNCTION service_private.staff_user(session_hash text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid;
BEGIN
 SELECT u.id INTO who FROM staff_private.sessions s
 JOIN public.organization_memberships m ON m.id=s.membership_id
 JOIN public.users u ON u.id=m.user_id JOIN staff_private.credentials c ON c.membership_id=m.id
 WHERE s.token_hash=session_hash AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() AND s.idle_expires_at>clock_timestamp()
 AND m.status='active' AND u.status='active' AND c.enabled AND c.version=s.credential_version AND m.role_id=s.role_id
 AND m.id=app.current_membership_id() AND m.organization_id=app.current_organization_id() AND u.id=app.current_user_id();
 IF who IS NULL THEN RAISE EXCEPTION 'SERVICE_SESSION_INVALID' USING ERRCODE='28000'; END IF; RETURN who;
END $$;
REVOKE ALL ON FUNCTION service_private.guest_user(text),service_private.staff_user(text) FROM PUBLIC;
-- A completed cleaning must already have its inspected, exact operational charge.
CREATE FUNCTION app.service_cleaning_completion_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.status='completed' AND EXISTS(SELECT 1 FROM public.service_cleaning_tasks WHERE order_id=NEW.id) AND NOT EXISTS(
  SELECT 1 FROM public.service_cleaning_tasks t JOIN public.folio_entries e ON e.id=t.folio_entry_id JOIN public.guest_folios f ON f.id=e.folio_id
  WHERE t.order_id=NEW.id AND t.stage='done' AND t.inspected_by IS NOT NULL AND f.reservation_id=NEW.reservation_id
   AND e.organization_id=NEW.organization_id AND e.property_id=NEW.property_id AND e.currency=NEW.currency
   AND e.amount_minor=NEW.total_minor AND e.source_type='service_order' AND e.source_id=NEW.id AND e.kind='service')
 THEN RAISE EXCEPTION 'SERVICE_INSPECTION_REQUIRED' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER service_cleaning_completion_guard BEFORE UPDATE ON service_orders FOR EACH ROW EXECUTE FUNCTION app.service_cleaning_completion_guard();
REVOKE ALL ON FUNCTION app.service_catalog_revision(),app.service_cleaning_completion_guard() FROM PUBLIC;
COMMIT;
