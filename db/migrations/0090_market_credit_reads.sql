BEGIN;
CREATE OR REPLACE FUNCTION service_private.market_receipt(oid uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('orderId',o.id,'stage',m.stage,'revision',m.revision,'currency',o.currency,'totalMinor',o.total_minor::text,'requestedFor',o.requested_for,'lines',o.snapshot->'lines','creditedMinor',(SELECT coalesce(sum(c.amount_minor::numeric),0)::text FROM public.market_credits c WHERE c.order_id=o.id),'credits',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'amountMinor',c.amount_minor::text,'reason',c.reason,'createdAt',c.created_at) ORDER BY c.created_at DESC,c.id DESC),'[]') FROM (SELECT * FROM public.market_credits WHERE order_id=o.id ORDER BY created_at DESC,id DESC LIMIT 20) c),'proposal',m.proposal,'issue',m.issue,'idempotentReplay',false,
 'replacesOrderId',m.replaces_order_id,'replacedByOrderId',(SELECT replacement.order_id FROM public.market_orders replacement WHERE replacement.replaces_order_id=o.id))
 FROM public.service_orders o JOIN public.market_orders m ON m.order_id=o.id WHERE o.id=oid
$$;

COMMIT;
