BEGIN;
-- Do not expose earlier reasons entered without a guest-visible disclosure.
ALTER TABLE public.market_orders ADD COLUMN reopen_history jsonb NOT NULL DEFAULT '[]',ADD COLUMN reopen_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.market_orders ADD CONSTRAINT market_reopen_history_shape CHECK(jsonb_typeof(reopen_history)='array' AND jsonb_array_length(reopen_history)<=20 AND reopen_count>=jsonb_array_length(reopen_history));
CREATE OR REPLACE FUNCTION service_private.market_reopen_picking(session_hash text,oid uuid,key uuid,body jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid:=service_private.staff_user(session_hash);mid uuid:=app.current_membership_id();ord public.service_orders;m public.market_orders;
 payload jsonb:=jsonb_build_object('kind','market_reopen_picking','orderId',oid,'membershipId',mid,'body',body);prior jsonb;result jsonb;
BEGIN
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM ARRAY['action','expectedRevision','note','returnedToStorage']
 OR body->>'action' IS DISTINCT FROM 'reopen_picking' OR body->'returnedToStorage' IS DISTINCT FROM 'true'::jsonb
 OR jsonb_typeof(body->'expectedRevision') IS DISTINCT FROM 'number' OR body->>'expectedRevision' !~ '^[1-9][0-9]*$'
 OR jsonb_typeof(body->'note') IS DISTINCT FROM 'string' OR length(btrim(body->>'note')) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023';END IF;
 SELECT o.* INTO ord FROM public.service_orders o JOIN public.market_orders linked ON linked.order_id=o.id WHERE o.id=oid;
 IF ord.id IS NULL THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002';END IF;
 IF NOT app.registry_access(ord.organization_id,ord.property_id,'stock.manage') THEN RAISE EXCEPTION 'SERVICE_FORBIDDEN' USING ERRCODE='42501';END IF;
 prior:=service_private.service_command_replay(who,key,payload);IF prior IS NOT NULL THEN RETURN prior;END IF;
 PERFORM 1 FROM public.reservations WHERE id=ord.reservation_id FOR UPDATE;
 SELECT * INTO m FROM public.market_orders WHERE order_id=oid FOR UPDATE;
 PERFORM service_private.staff_user(session_hash);
 IF NOT app.registry_access(ord.organization_id,ord.property_id,'stock.manage') THEN RAISE EXCEPTION 'SERVICE_FORBIDDEN' USING ERRCODE='42501';END IF;
 IF m.revision IS DISTINCT FROM (body->>'expectedRevision')::integer THEN RAISE EXCEPTION 'SERVICE_REVISION_CHANGED' USING ERRCODE='23514';END IF;
 IF m.stage NOT IN ('picking','ready') THEN RAISE EXCEPTION 'SERVICE_TRANSITION_INVALID' USING ERRCODE='23514';END IF;
 -- All three stages retain the same stock reservation; no physical stock movement.
 UPDATE public.market_orders SET stage='reserved',checklist=NULL,
 reopen_count=m.reopen_count+1,
 reopen_history=(SELECT jsonb_agg(e.value ORDER BY e.n) FROM jsonb_array_elements(jsonb_build_array(jsonb_build_object('at',clock_timestamp(),'note',btrim(body->>'note')))||m.reopen_history) WITH ORDINALITY e(value,n) WHERE e.n<=20),
 revision=revision+1,updated_at=clock_timestamp() WHERE order_id=oid;
 UPDATE public.service_orders SET status='requested' WHERE id=oid;
 result:=service_private.market_receipt(oid);
 PERFORM service_private.service_command_record(who,mid,key,payload,result,ord.organization_id,oid,'market.reopen_picking');RETURN result;
END $$;
CREATE OR REPLACE FUNCTION service_private.market_receipt(oid uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('orderId',o.id,'reopenHistory',m.reopen_history,'reopenCount',m.reopen_count,'stage',m.stage,'revision',m.revision,'currency',o.currency,'totalMinor',o.total_minor::text,'requestedFor',o.requested_for,'lines',o.snapshot->'lines','creditedMinor',(SELECT coalesce(sum(c.amount_minor::numeric),0)::text FROM public.market_credits c WHERE c.order_id=o.id),'credits',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'amountMinor',c.amount_minor::text,'reason',c.reason,'createdAt',c.created_at) ORDER BY c.created_at DESC,c.id DESC),'[]') FROM (SELECT * FROM public.market_credits WHERE order_id=o.id ORDER BY created_at DESC,id DESC LIMIT 20) c),'returnedByService',(SELECT coalesce(jsonb_agg(jsonb_build_object('serviceId',r.service_id,'quantity',r.quantity)),'[]') FROM (SELECT service_id,sum(quantity)::integer quantity FROM public.market_returns WHERE order_id=o.id GROUP BY service_id) r),'returns',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'serviceId',r.service_id,'quantity',r.quantity,'status',r.status,'reason',r.reason,'resolutionNote',r.resolution_note,'receivedAt',r.created_at,'resolvedAt',r.resolved_at) ORDER BY r.created_at DESC,r.id DESC),'[]') FROM (SELECT * FROM public.market_returns WHERE order_id=o.id ORDER BY created_at DESC,id DESC LIMIT 20) r),'proposal',m.proposal,'issue',m.issue,'idempotentReplay',false,
 'replacesOrderId',m.replaces_order_id,'replacedByOrderId',(SELECT replacement.order_id FROM public.market_orders replacement WHERE replacement.replaces_order_id=o.id))
 FROM public.service_orders o JOIN public.market_orders m ON m.order_id=o.id WHERE o.id=oid
$$;

COMMIT;
