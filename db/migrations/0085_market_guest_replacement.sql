BEGIN;
-- A replacement creates another immutable shared order; never rewrite its price snapshot.
ALTER TABLE public.market_orders ADD COLUMN replaces_order_id uuid;
ALTER TABLE public.market_orders ADD CONSTRAINT market_replacement_scope_fk
 FOREIGN KEY(organization_id,property_id,replaces_order_id)
 REFERENCES public.market_orders(organization_id,property_id,order_id);
ALTER TABLE public.market_orders ADD CONSTRAINT market_replacement_not_self CHECK(replaces_order_id IS DISTINCT FROM order_id);
CREATE UNIQUE INDEX market_replacement_once_idx ON public.market_orders(replaces_order_id) WHERE replaces_order_id IS NOT NULL;

CREATE FUNCTION service_private.market_replace(session_hash text,oid uuid,key uuid,body jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid:=service_private.guest_user(session_hash); ord public.service_orders;
 stay public.reservations; m public.market_orders; prior jsonb; result jsonb; replacement uuid;
 payload jsonb:=jsonb_build_object('kind','market_replace','orderId',oid,'body',body);
BEGIN
 IF jsonb_typeof(body) IS DISTINCT FROM 'object'
 OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM ARRAY['action','expectedRevision','expectedTotalMinor','lines']
 OR body->>'action' IS DISTINCT FROM 'replace_order'
 OR jsonb_typeof(body->'expectedRevision') IS DISTINCT FROM 'number'
 OR body->>'expectedRevision' !~ '^[1-9][0-9]*$'
 OR jsonb_typeof(body->'lines') IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(body->'lines') NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 SELECT o.* INTO ord FROM public.service_orders o JOIN public.market_orders linked ON linked.order_id=o.id WHERE o.id=oid;
 IF ord.id IS NULL THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 PERFORM 1 FROM public.reservations r JOIN public.guest_profiles g ON g.id=r.primary_guest_id AND g.organization_id=r.organization_id WHERE r.id=ord.reservation_id AND g.user_id=who;
 IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 prior:=service_private.service_command_replay(who,key,payload);IF prior IS NOT NULL THEN RETURN prior;END IF;
 SELECT * INTO stay FROM public.reservations WHERE id=ord.reservation_id FOR UPDATE;
 SELECT * INTO m FROM public.market_orders WHERE order_id=oid FOR UPDATE;
 PERFORM service_private.guest_user(session_hash);
 PERFORM 1 FROM public.guest_profiles WHERE id=stay.primary_guest_id AND organization_id=stay.organization_id AND user_id=who FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF m.revision IS DISTINCT FROM (body->>'expectedRevision')::integer THEN RAISE EXCEPTION 'SERVICE_REVISION_CHANGED' USING ERRCODE='23514'; END IF;
 IF m.stage<>'reserved' THEN RAISE EXCEPTION 'SERVICE_TRANSITION_INVALID' USING ERRCODE='23514'; END IF;
 -- Lock new catalogue mappings first, then the union of old/new stock in one order.
 -- The nested request reuses these locks and validates all prices, scope and stock.
 PERFORM 1 FROM public.service_catalog c JOIN public.market_products p ON p.service_id=c.id
 WHERE c.id IN (SELECT (l->>'serviceId')::uuid FROM jsonb_array_elements(body->'lines') l)
 AND c.organization_id=ord.organization_id AND c.property_id=ord.property_id AND c.currency=ord.currency
 ORDER BY p.item_id FOR SHARE OF c,p;
 PERFORM 1 FROM public.supply_items i WHERE i.organization_id=ord.organization_id AND i.property_id=ord.property_id AND i.id IN (
  SELECT held.item_id FROM public.market_order_lines held WHERE held.order_id=oid
  UNION SELECT p.item_id FROM public.market_products p WHERE p.service_id IN (SELECT (l->>'serviceId')::uuid FROM jsonb_array_elements(body->'lines') l)
 ) ORDER BY i.id FOR UPDATE;
 UPDATE public.market_orders SET stage='cancelled',revision=revision+1,updated_at=clock_timestamp() WHERE order_id=oid;
 UPDATE public.service_orders SET status='cancelled' WHERE id=oid;
 result:=app.market_request(session_hash,gen_random_uuid(),jsonb_build_object('reservationId',ord.reservation_id,'lines',body->'lines','expectedTotalMinor',body->'expectedTotalMinor'));
 replacement:=(result->>'orderId')::uuid;
 UPDATE public.market_orders SET replaces_order_id=oid WHERE order_id=replacement;
 result:=service_private.market_receipt(replacement);
 PERFORM service_private.service_command_record(who,NULL,key,payload,result,ord.organization_id,oid,'market.replaced');RETURN result;
END $$;
CREATE OR REPLACE FUNCTION app.market_guest_act(session_hash text,oid uuid,key uuid,body jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF body->>'action'='replace_order' THEN RETURN service_private.market_replace(session_hash,oid,key,body);END IF;
 RETURN service_private.market_act(session_hash,oid,key,body,false);
END $$;
CREATE OR REPLACE FUNCTION service_private.market_receipt(oid uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('orderId',o.id,'stage',m.stage,'revision',m.revision,'currency',o.currency,'totalMinor',o.total_minor::text,'requestedFor',o.requested_for,'lines',o.snapshot->'lines','issue',m.issue,'idempotentReplay',false,
 'replacesOrderId',m.replaces_order_id,'replacedByOrderId',(SELECT replacement.order_id FROM public.market_orders replacement WHERE replacement.replaces_order_id=o.id))
 FROM public.service_orders o JOIN public.market_orders m ON m.order_id=o.id WHERE o.id=oid
$$;
REVOKE ALL ON FUNCTION service_private.market_replace(text,uuid,uuid,jsonb) FROM PUBLIC;
COMMIT;
