BEGIN;
CREATE FUNCTION app.laundry_completion_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.status='completed' AND NEW.snapshot->>'execution'='laundry' AND NOT EXISTS(
  SELECT 1 FROM public.laundry_intakes i JOIN public.folio_entries e ON e.id=i.folio_entry_id JOIN public.guest_folios f ON f.id=e.folio_id
  WHERE i.order_id=NEW.id AND i.stage='closed' AND i.organization_id=NEW.organization_id AND i.property_id=NEW.property_id
   AND i.total_minor=NEW.total_minor AND e.amount_minor=NEW.total_minor AND e.currency=NEW.currency
   AND e.organization_id=NEW.organization_id AND e.property_id=NEW.property_id AND f.reservation_id=NEW.reservation_id
   AND e.kind='service' AND e.source_type='service_order' AND e.source_id=NEW.id)
 THEN RAISE EXCEPTION 'SERVICE_RECEIPT_REQUIRED' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER laundry_completion_guard BEFORE UPDATE ON service_orders FOR EACH ROW EXECUTE FUNCTION app.laundry_completion_guard();
REVOKE ALL ON FUNCTION app.laundry_completion_guard() FROM PUBLIC;
COMMIT;
