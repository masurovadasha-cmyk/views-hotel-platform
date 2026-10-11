BEGIN;
ALTER TABLE public.market_orders ADD COLUMN proposal jsonb;
CREATE FUNCTION app.market_proposal_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF OLD.proposal->>'status'='pending' THEN
  IF NEW.stage='picking' AND OLD.stage='reserved' THEN RAISE EXCEPTION 'SERVICE_TRANSITION_INVALID' USING ERRCODE='23514';END IF;
  IF NEW.stage='cancelled' AND NEW.proposal->>'status'='pending' THEN NEW.proposal:=NEW.proposal||jsonb_build_object('status','cancelled');END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER market_proposal_guard BEFORE UPDATE OF stage ON public.market_orders FOR EACH ROW EXECUTE FUNCTION app.market_proposal_guard();
CREATE FUNCTION app.market_staff_catalog(session_hash text,property uuid,after_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid:=service_private.staff_user(session_hash); result jsonb;
BEGIN
 IF NOT app.registry_access(app.current_organization_id(),property,'stock.manage') THEN RAISE EXCEPTION 'SERVICE_FORBIDDEN' USING ERRCODE='42501';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'priceMinor',c.price_minor::text,'currency',c.currency,'revision',c.revision,'availableQuantity',c.available::text) ORDER BY c.id),'[]') INTO result
 FROM (SELECT c.*,greatest(0,coalesce(b.quantity,0)-service_private.market_reserved(p.item_id)) available
 FROM public.service_catalog c JOIN public.market_products p ON p.service_id=c.id JOIN public.supply_items i ON i.id=p.item_id LEFT JOIN public.supply_balances b ON b.item_id=i.id
 WHERE c.organization_id=app.current_organization_id() AND c.property_id=property AND c.active AND c.execution_kind='market' AND c.price_minor>0 AND i.unit='piece'
 AND (after_id IS NULL OR c.id>after_id) ORDER BY c.id LIMIT 51) c;
 RETURN jsonb_build_object('items',result);
END $$;
CREATE OR REPLACE FUNCTION service_private.market_receipt(oid uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('orderId',o.id,'stage',m.stage,'revision',m.revision,'currency',o.currency,'totalMinor',o.total_minor::text,'requestedFor',o.requested_for,'lines',o.snapshot->'lines','proposal',m.proposal,'issue',m.issue,'idempotentReplay',false,
 'replacesOrderId',m.replaces_order_id,'replacedByOrderId',(SELECT replacement.order_id FROM public.market_orders replacement WHERE replacement.replaces_order_id=o.id))
 FROM public.service_orders o JOIN public.market_orders m ON m.order_id=o.id WHERE o.id=oid
$$;

REVOKE ALL ON FUNCTION app.market_proposal_guard(),app.market_staff_catalog(text,uuid,uuid) FROM PUBLIC;
COMMIT;
