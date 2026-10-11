BEGIN;
ALTER TABLE service_catalog DROP CONSTRAINT service_catalog_execution_kind_check;
ALTER TABLE service_catalog ADD CONSTRAINT service_catalog_execution_kind_check CHECK(execution_kind IN ('cleaning','laundry','market'));
CREATE TABLE market_products (
 service_id uuid PRIMARY KEY, organization_id uuid NOT NULL,property_id uuid NOT NULL,currency char(3) NOT NULL,item_id uuid NOT NULL UNIQUE,
 FOREIGN KEY(organization_id,property_id,service_id,currency) REFERENCES service_catalog(organization_id,property_id,id,currency),
 FOREIGN KEY(organization_id,property_id,item_id) REFERENCES supply_items(organization_id,property_id,id)
);
CREATE TABLE market_orders (
 order_id uuid PRIMARY KEY,organization_id uuid NOT NULL,property_id uuid NOT NULL,
 stage text NOT NULL DEFAULT 'reserved' CHECK(stage IN ('reserved','picking','ready','handed_over','completed','cancelled')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),folio_entry_id uuid UNIQUE REFERENCES folio_entries(id),
 checklist jsonb,updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(organization_id,property_id,order_id) REFERENCES service_orders(organization_id,property_id,id),
 UNIQUE(organization_id,property_id,order_id),CHECK((stage='completed')=(folio_entry_id IS NOT NULL))
);
CREATE TABLE market_order_lines (
 organization_id uuid NOT NULL,property_id uuid NOT NULL,order_id uuid NOT NULL,item_id uuid NOT NULL,quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 50),
 PRIMARY KEY(order_id,item_id),
 FOREIGN KEY(organization_id,property_id,order_id) REFERENCES market_orders(organization_id,property_id,order_id),
 FOREIGN KEY(organization_id,property_id,item_id) REFERENCES supply_items(organization_id,property_id,id)
);
CREATE INDEX market_orders_queue_idx ON market_orders(organization_id,property_id,order_id);
CREATE INDEX market_order_lines_item_idx ON market_order_lines(item_id,order_id);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['market_products','market_orders','market_order_lines'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY market_read ON %I FOR SELECT USING(app.registry_access(organization_id,property_id,''supply.read'') OR app.registry_access(organization_id,property_id,''reservation.manage''))',t);
 END LOOP;
END $$;
-- No runtime table writes. Product publication is not enabled by this migration.
CREATE FUNCTION service_private.market_reserved(item uuid) RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce(sum(l.quantity),0)::bigint FROM public.market_order_lines l JOIN public.market_orders m ON m.order_id=l.order_id WHERE l.item_id=item AND m.stage IN ('reserved','picking','ready')
$$;
-- Existing receipt/issue/count operations lock supply_items. New market commands
-- take those same locks, in item-id order, before checking or releasing reserves.
CREATE FUNCTION app.market_balance_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.quantity<service_private.market_reserved(NEW.item_id) THEN RAISE EXCEPTION 'SERVICE_STOCK_RESERVED' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER market_balance_guard AFTER INSERT OR UPDATE OF quantity ON supply_balances FOR EACH ROW EXECUTE FUNCTION app.market_balance_guard();
CREATE FUNCTION service_private.market_receipt(oid uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('orderId',o.id,'stage',m.stage,'revision',m.revision,'currency',o.currency,'totalMinor',o.total_minor::text,'requestedFor',o.requested_for,'lines',o.snapshot->'lines','idempotentReplay',false)
 FROM public.service_orders o JOIN public.market_orders m ON m.order_id=o.id WHERE o.id=oid
$$;
REVOKE ALL ON FUNCTION app.market_balance_guard(),service_private.market_reserved(uuid),service_private.market_receipt(uuid) FROM PUBLIC;
COMMIT;
