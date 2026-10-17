BEGIN;
-- Historical inspection times are unknown: intentionally no backfill.
ALTER TABLE public.market_returns ADD COLUMN resolved_at timestamptz;
ALTER TABLE public.market_returns ADD CONSTRAINT market_return_timeline CHECK (
 resolved_at IS NULL OR (status IN ('restocked','discarded') AND resolved_at>=created_at));
CREATE FUNCTION service_private.market_return_stamp() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 NEW.created_at:=OLD.created_at;
 IF OLD.status='quarantined' AND NEW.status IN ('restocked','discarded') THEN
  NEW.resolved_at:=greatest(clock_timestamp(),OLD.created_at);
 ELSE NEW.resolved_at:=OLD.resolved_at;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION service_private.market_return_stamp() FROM PUBLIC;
CREATE TRIGGER market_return_stamp BEFORE UPDATE ON public.market_returns
 FOR EACH ROW EXECUTE FUNCTION service_private.market_return_stamp();

CREATE OR REPLACE FUNCTION service_private.market_receipt(oid uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('orderId',o.id,'stage',m.stage,'revision',m.revision,'currency',o.currency,'totalMinor',o.total_minor::text,'requestedFor',o.requested_for,'lines',o.snapshot->'lines','creditedMinor',(SELECT coalesce(sum(c.amount_minor::numeric),0)::text FROM public.market_credits c WHERE c.order_id=o.id),'credits',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'amountMinor',c.amount_minor::text,'reason',c.reason,'createdAt',c.created_at) ORDER BY c.created_at DESC,c.id DESC),'[]') FROM (SELECT * FROM public.market_credits WHERE order_id=o.id ORDER BY created_at DESC,id DESC LIMIT 20) c),'returnedByService',(SELECT coalesce(jsonb_agg(jsonb_build_object('serviceId',r.service_id,'quantity',r.quantity)),'[]') FROM (SELECT service_id,sum(quantity)::integer quantity FROM public.market_returns WHERE order_id=o.id GROUP BY service_id) r),'returns',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'serviceId',r.service_id,'quantity',r.quantity,'status',r.status,'reason',r.reason,'resolutionNote',r.resolution_note,'receivedAt',r.created_at,'resolvedAt',r.resolved_at) ORDER BY r.created_at DESC,r.id DESC),'[]') FROM (SELECT * FROM public.market_returns WHERE order_id=o.id ORDER BY created_at DESC,id DESC LIMIT 20) r),'proposal',m.proposal,'issue',m.issue,'idempotentReplay',false,
 'replacesOrderId',m.replaces_order_id,'replacedByOrderId',(SELECT replacement.order_id FROM public.market_orders replacement WHERE replacement.replaces_order_id=o.id))
 FROM public.service_orders o JOIN public.market_orders m ON m.order_id=o.id WHERE o.id=oid
$$;

COMMIT;
