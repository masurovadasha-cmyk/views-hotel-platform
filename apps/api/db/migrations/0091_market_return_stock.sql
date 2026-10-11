BEGIN;
CREATE TABLE public.market_returns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,property_id uuid NOT NULL,order_id uuid NOT NULL,
 service_id uuid NOT NULL REFERENCES public.service_catalog(id),item_id uuid NOT NULL,quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 50),
 status text NOT NULL DEFAULT 'quarantined' CHECK(status IN ('quarantined','restocked','discarded')),reason text NOT NULL CHECK(length(reason) BETWEEN 3 AND 500),resolution_note text,
 movement_id uuid UNIQUE REFERENCES public.supply_movements(id) DEFERRABLE INITIALLY DEFERRED,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(organization_id,property_id,order_id) REFERENCES public.market_orders(organization_id,property_id,order_id),
 FOREIGN KEY(organization_id,property_id,item_id) REFERENCES public.supply_items(organization_id,property_id,id),
 UNIQUE(organization_id,property_id,id),CHECK((status='restocked')=(movement_id IS NOT NULL))
);
CREATE INDEX market_returns_order_idx ON public.market_returns(order_id,service_id,created_at,id);
ALTER TABLE public.market_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_returns FORCE ROW LEVEL SECURITY;
CREATE POLICY market_returns_read ON public.market_returns FOR SELECT USING(app.registry_access(organization_id,property_id,'supply.read') OR app.registry_access(organization_id,property_id,'finance.read'));
ALTER TABLE public.supply_movements ADD COLUMN market_return_id uuid UNIQUE;
ALTER TABLE public.supply_movements ADD CONSTRAINT supply_market_return_fk FOREIGN KEY(organization_id,property_id,market_return_id) REFERENCES public.market_returns(organization_id,property_id,id);
ALTER TABLE public.supply_movements DROP CONSTRAINT supply_movements_kind_check;
ALTER TABLE public.supply_movements ADD CONSTRAINT supply_movements_kind_check CHECK(kind IN ('receipt','issue','adjustment','return'));
ALTER TABLE public.supply_movements DROP CONSTRAINT supply_movements_check;
ALTER TABLE public.supply_movements ADD CONSTRAINT supply_movements_check CHECK(
 (kind='receipt' AND quantity>0 AND receipt_id IS NOT NULL AND order_line_id IS NOT NULL AND stocktake_id IS NULL AND market_return_id IS NULL)
 OR (kind='issue' AND quantity<0 AND receipt_id IS NULL AND order_line_id IS NULL AND stocktake_id IS NULL AND market_return_id IS NULL)
 OR (kind='adjustment' AND receipt_id IS NULL AND order_line_id IS NULL AND stocktake_id IS NOT NULL AND market_return_id IS NULL)
 OR (kind='return' AND quantity>0 AND receipt_id IS NULL AND order_line_id IS NULL AND stocktake_id IS NULL AND market_return_id IS NOT NULL));
CREATE FUNCTION app.market_return_movement_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.kind='return' AND NOT EXISTS(SELECT 1 FROM public.market_returns r WHERE r.id=NEW.market_return_id AND r.organization_id=NEW.organization_id AND r.property_id=NEW.property_id AND r.item_id=NEW.item_id AND r.quantity=NEW.quantity AND r.status='restocked' AND r.movement_id=NEW.id)
 THEN RAISE EXCEPTION 'SERVICE_RETURN_INVALID' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER market_return_movement_guard BEFORE INSERT ON public.supply_movements FOR EACH ROW EXECUTE FUNCTION app.market_return_movement_guard();
REVOKE ALL ON FUNCTION app.market_return_movement_guard() FROM PUBLIC;
COMMIT;
