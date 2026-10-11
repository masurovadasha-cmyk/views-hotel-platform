BEGIN;
CREATE FUNCTION app.market_guest_list(session_hash text,reservation uuid,after_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid:=service_private.guest_user(session_hash); result jsonb;
BEGIN
 PERFORM 1 FROM public.reservations r JOIN public.guest_profiles g ON g.id=r.primary_guest_id AND g.organization_id=r.organization_id WHERE r.id=reservation AND g.user_id=who;
 IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT coalesce(jsonb_agg(service_private.market_receipt(o.id) ORDER BY o.id),'[]') INTO result FROM
 (SELECT o.id FROM public.service_orders o JOIN public.market_orders m ON m.order_id=o.id WHERE o.reservation_id=reservation AND (after_id IS NULL OR o.id>after_id) ORDER BY o.id LIMIT 51) o;
 RETURN jsonb_build_object('items',result);
END $$;
CREATE FUNCTION app.market_staff_list(session_hash text,property uuid,after_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid:=service_private.staff_user(session_hash); result jsonb;
BEGIN
 IF NOT app.registry_access(app.current_organization_id(),property,'stock.manage') THEN RAISE EXCEPTION 'SERVICE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(service_private.market_receipt(o.id)||jsonb_build_object('unitCode',o.code) ORDER BY o.id),'[]') INTO result FROM
 (SELECT o.id,u.code FROM public.service_orders o JOIN public.market_orders m ON m.order_id=o.id
 JOIN public.reservations r ON r.id=o.reservation_id AND r.organization_id=o.organization_id AND r.property_id=o.property_id JOIN public.units u ON u.id=r.unit_id AND u.property_id=r.property_id
 WHERE o.organization_id=app.current_organization_id() AND o.property_id=property AND (after_id IS NULL OR o.id>after_id) ORDER BY o.id LIMIT 51) o;
 RETURN jsonb_build_object('items',result);
END $$;
CREATE FUNCTION app.market_completion_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.status='completed' AND NEW.snapshot->>'execution'='market' AND NOT EXISTS(
 SELECT 1 FROM public.market_orders m JOIN public.folio_entries e ON e.id=m.folio_entry_id JOIN public.guest_folios f ON f.id=e.folio_id
 WHERE m.order_id=NEW.id AND m.stage='completed' AND m.organization_id=NEW.organization_id AND m.property_id=NEW.property_id
 AND e.amount_minor=NEW.total_minor AND e.currency=NEW.currency AND e.organization_id=NEW.organization_id AND e.property_id=NEW.property_id AND f.reservation_id=NEW.reservation_id
 AND e.kind='service' AND e.source_type='service_order' AND e.source_id=NEW.id)
 THEN RAISE EXCEPTION 'SERVICE_RECEIPT_REQUIRED' USING ERRCODE='23514';END IF;RETURN NEW;
END $$;
CREATE TRIGGER market_completion_guard BEFORE UPDATE ON service_orders FOR EACH ROW EXECUTE FUNCTION app.market_completion_guard();
REVOKE ALL ON FUNCTION app.market_guest_list(text,uuid,uuid),app.market_staff_list(text,uuid,uuid),app.market_completion_guard() FROM PUBLIC;
COMMIT;
