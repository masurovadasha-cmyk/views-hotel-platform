BEGIN;
-- Preparation only: record every NEW physical movement, without inventing lot balances.
CREATE TABLE public.supply_lot_movement_intake(
 movement_id uuid PRIMARY KEY REFERENCES public.supply_movements(id),organization_id uuid NOT NULL,property_id uuid NOT NULL,
 status text NOT NULL CHECK(status IN ('receipt_lot_recorded','snapshot_recorded','allocation_pending')),
 FOREIGN KEY(organization_id,property_id) REFERENCES public.properties(organization_id,id)
);
ALTER TABLE public.supply_lot_movement_intake ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supply_lot_movement_intake FORCE ROW LEVEL SECURITY;
CREATE POLICY supply_lot_intake_read ON public.supply_lot_movement_intake FOR SELECT USING(app.registry_access(organization_id,property_id,'supply.read'));
-- No runtime write policy: only the movement trigger can record provenance.
CREATE TRIGGER supply_lot_intake_immutable BEFORE UPDATE OR DELETE ON public.supply_lot_movement_intake FOR EACH ROW EXECUTE FUNCTION app.registry_append_only();
CREATE FUNCTION app.supply_capture_lot_movement() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE classification text:='allocation_pending';
BEGIN
 IF NEW.kind='receipt' AND EXISTS(SELECT 1 FROM public.supply_receipt_lines r WHERE r.receipt_id=NEW.receipt_id AND r.order_line_id=NEW.order_line_id AND r.organization_id=NEW.organization_id AND r.property_id=NEW.property_id AND r.lot_code IS NOT NULL) THEN classification:='receipt_lot_recorded'; END IF;
 IF NEW.kind='adjustment' AND EXISTS(SELECT 1 FROM public.supply_stocktakes s WHERE s.id=NEW.stocktake_id AND s.organization_id=NEW.organization_id AND s.property_id=NEW.property_id AND s.lot_counts IS NOT NULL) THEN classification:='snapshot_recorded'; END IF;
 INSERT INTO public.supply_lot_movement_intake(movement_id,organization_id,property_id,status) VALUES(NEW.id,NEW.organization_id,NEW.property_id,classification);
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION app.supply_capture_lot_movement() FROM PUBLIC;
CREATE TRIGGER supply_lot_movement_capture AFTER INSERT ON public.supply_movements FOR EACH ROW EXECUTE FUNCTION app.supply_capture_lot_movement();
-- No backfill: absence means the movement predates intake tracking, not allocated.
COMMIT;
