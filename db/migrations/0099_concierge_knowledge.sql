BEGIN;
CREATE TABLE concierge_knowledge (
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,property_id uuid NOT NULL,
 language text NOT NULL CHECK(language IN ('ru','uz','en')),
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 80 AND title !~ '[[:cntrl:]]'),
 content text NOT NULL CHECK(length(content) BETWEEN 1 AND 500 AND content !~ '[[:cntrl:]]'),
 active boolean NOT NULL,revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_by uuid NOT NULL REFERENCES users(id),
 FOREIGN KEY(organization_id,property_id) REFERENCES properties(organization_id,id)
);
CREATE INDEX concierge_knowledge_scope_idx ON concierge_knowledge(organization_id,property_id,id);
ALTER TABLE concierge_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE concierge_knowledge FORCE ROW LEVEL SECURITY;
CREATE POLICY concierge_knowledge_read ON concierge_knowledge FOR SELECT USING(app.registry_access(organization_id,property_id,'reservation.manage') OR active AND app.registry_access(organization_id,property_id,'concierge.work'));
CREATE FUNCTION app.concierge_knowledge_list(session_hash text,property uuid,after_id uuid DEFAULT NULL,search text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid:=service_private.staff_user(session_hash);manager boolean:=app.registry_access(app.current_organization_id(),property,'reservation.manage');rows jsonb;
BEGIN
 IF NOT manager AND NOT app.registry_access(app.current_organization_id(),property,'concierge.work') THEN RAISE EXCEPTION 'SERVICE_FORBIDDEN' USING ERRCODE='42501';END IF;
 IF search IS NULL OR length(search)>80 OR search ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(k)-'organization_id'-'property_id'-'updated_by' ORDER BY k.id),'[]') INTO rows FROM (
 SELECT * FROM public.concierge_knowledge WHERE organization_id=app.current_organization_id() AND property_id=property AND (manager OR active)
 AND (after_id IS NULL OR id>after_id) AND (search='' OR strpos(lower(title||' '||content),lower(search))>0) ORDER BY id LIMIT 11) k;
 RETURN jsonb_build_object('items',rows);
END $$;
CREATE FUNCTION app.concierge_knowledge_save(session_hash text,property uuid,key uuid,body jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid:=service_private.staff_user(session_hash);mid uuid:=app.current_membership_id();org uuid:=app.current_organization_id();old public.concierge_knowledge;result jsonb;prior jsonb;
 payload jsonb:=jsonb_build_object('kind','knowledge_save','propertyId',property,'membershipId',mid,'body',body);target uuid;
BEGIN
 IF NOT app.registry_access(org,property,'reservation.manage') THEN RAISE EXCEPTION 'SERVICE_FORBIDDEN' USING ERRCODE='42501';END IF;
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM ARRAY['active','expectedRevision','id','language','text','title']
 OR jsonb_typeof(body->'active') IS DISTINCT FROM 'boolean' OR jsonb_typeof(body->'expectedRevision') IS DISTINCT FROM 'number' OR body->>'expectedRevision' !~ '^(0|[1-9][0-9]*)$'
 OR jsonb_typeof(body->'language') IS DISTINCT FROM 'string' OR body->>'language' NOT IN ('ru','uz','en')
 OR jsonb_typeof(body->'title') IS DISTINCT FROM 'string' OR length(btrim(body->>'title')) NOT BETWEEN 1 AND 80 OR body->>'title' ~ '[[:cntrl:]]'
 OR jsonb_typeof(body->'text') IS DISTINCT FROM 'string' OR length(btrim(body->>'text')) NOT BETWEEN 1 AND 500 OR body->>'text' ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023';END IF;
 target:=(body->>'id')::uuid;
 prior:=service_private.service_command_replay(who,key,payload);IF prior IS NOT NULL THEN RETURN prior;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('knowledge:'||target,0));
 PERFORM service_private.staff_user(session_hash);
 IF NOT app.registry_access(org,property,'reservation.manage') THEN RAISE EXCEPTION 'SERVICE_FORBIDDEN' USING ERRCODE='42501';END IF;
 SELECT * INTO old FROM public.concierge_knowledge WHERE id=target FOR UPDATE;
 IF old.id IS NOT NULL AND (old.organization_id<>org OR old.property_id<>property) THEN RAISE EXCEPTION 'SERVICE_FORBIDDEN' USING ERRCODE='42501';END IF;
 IF coalesce(old.revision,0) IS DISTINCT FROM (body->>'expectedRevision')::integer THEN RAISE EXCEPTION 'SERVICE_REVISION_CHANGED' USING ERRCODE='23514';END IF;
 IF old.id IS NULL THEN
  INSERT INTO public.concierge_knowledge(id,organization_id,property_id,language,title,content,active,updated_by) VALUES(target,org,property,body->>'language',btrim(body->>'title'),btrim(body->>'text'),(body->>'active')::boolean,who);
 ELSE UPDATE public.concierge_knowledge SET language=body->>'language',title=btrim(body->>'title'),content=btrim(body->>'text'),active=(body->>'active')::boolean,revision=revision+1,updated_at=clock_timestamp(),updated_by=who WHERE id=target;
 END IF;
 SELECT jsonb_build_object('id',id,'revision',revision,'active',active,'idempotentReplay',false) INTO result FROM public.concierge_knowledge WHERE id=target;
 INSERT INTO service_private.commands(actor_user_id,command_key,payload,result) VALUES(who,key,payload,result);
 INSERT INTO public.audit_log(organization_id,actor_user_id,actor_membership_id,action,entity_type,entity_id,after_state) VALUES(org,who,mid,'knowledge.saved','knowledge_article',target,result);
 INSERT INTO public.outbox_events(organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload) VALUES(org,'knowledge_article',target,'knowledge.saved','service-command:'||who||':'||key,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION app.concierge_knowledge_list(text,uuid,uuid,text),app.concierge_knowledge_save(text,uuid,uuid,jsonb) FROM PUBLIC;
COMMIT;
