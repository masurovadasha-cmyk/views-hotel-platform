BEGIN;
-- Read-only organization-owner projection; never grants access to staff queues.
CREATE FUNCTION app.owner_services_page(session_hash text,target_property uuid,page_kind text,after_id uuid,page_limit integer) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE items jsonb; result jsonb;
BEGIN
 IF NOT app.owner_calendar_authorize(session_hash,target_property) THEN RAISE EXCEPTION 'STAFF_SESSION_REQUIRED' USING ERRCODE='42501'; END IF;
 IF page_kind NOT IN ('catalog','orders') OR page_kind IS NULL OR page_limit IS NULL OR page_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'OWNER_SERVICES_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 IF page_kind='catalog' THEN
  SELECT coalesce(jsonb_agg(row_to_json(rows) ORDER BY rows.id),'[]') INTO items FROM (
   SELECT c.id,c.code,c.name,c.execution_kind AS "executionKind",c.price_minor::text AS "priceMinor",c.currency
   FROM public.service_catalog c WHERE c.organization_id=app.current_organization_id() AND c.property_id=target_property AND c.active AND c.currency='UZS'
   AND (after_id IS NULL OR c.id>after_id) ORDER BY c.id LIMIT page_limit+1
  ) rows;
 ELSE
  SELECT coalesce(jsonb_agg(row_to_json(rows) ORDER BY rows.id),'[]') INTO items FROM (
   SELECT o.id,o.service_id AS "serviceId",o.snapshot->'name' AS name,o.status,o.quantity,o.requested_for AS "requestedFor",o.created_at AS "createdAt"
   FROM public.service_orders o WHERE o.organization_id=app.current_organization_id() AND o.property_id=target_property AND o.status IN ('requested','accepted','in_progress')
   AND (after_id IS NULL OR o.id>after_id) ORDER BY o.id LIMIT page_limit+1
  ) rows;
 END IF;
 result:=jsonb_build_object('propertyId',target_property,'kind',page_kind,'items',CASE WHEN jsonb_array_length(items)>page_limit THEN items-page_limit ELSE items END,
  'nextCursor',CASE WHEN jsonb_array_length(items)>page_limit THEN items->(page_limit-1)->>'id' ELSE NULL END,'readOnly',true);
 IF NOT app.owner_calendar_authorize(session_hash,target_property) THEN RAISE EXCEPTION 'STAFF_SESSION_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION app.owner_services_page(text,uuid,text,uuid,integer) FROM PUBLIC;
COMMIT;
