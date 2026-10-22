BEGIN;
-- Opt-in manual issue provenance; no automatic lot balances or marketplace allocation.
ALTER TABLE public.supply_movements ADD COLUMN lot_allocation jsonb;
ALTER TABLE public.supply_movements ADD COLUMN lot_snapshot_id uuid GENERATED ALWAYS AS ((lot_allocation->>'snapshotId')::uuid) STORED REFERENCES public.supply_stocktakes(id);
CREATE FUNCTION app.supply_counted_lot_issue_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE snapshot public.supply_stocktakes; revision bigint;
BEGIN
 IF NEW.lot_allocation IS NULL THEN RETURN NEW; END IF;
 IF NEW.kind<>'issue' OR NEW.quantity>=0 OR jsonb_typeof(NEW.lot_allocation)<>'object' OR NOT(NEW.lot_allocation ?& ARRAY['snapshotId','lotCode','expiresOn']) OR (SELECT count(*) FROM jsonb_object_keys(NEW.lot_allocation))<>3 THEN RAISE EXCEPTION 'LOT_ALLOCATION_INVALID' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM public.supply_items WHERE id=NEW.item_id AND organization_id=NEW.organization_id AND property_id=NEW.property_id FOR UPDATE;
 SELECT * INTO snapshot FROM public.supply_stocktakes WHERE id=(NEW.lot_allocation->>'snapshotId')::uuid AND organization_id=NEW.organization_id AND property_id=NEW.property_id AND item_id=NEW.item_id AND lot_counts IS NOT NULL;
 SELECT b.revision INTO revision FROM public.supply_balances b WHERE b.item_id=NEW.item_id;
 IF snapshot.id IS NULL OR revision IS DISTINCT FROM snapshot.expected_revision+1 THEN RAISE EXCEPTION 'STOCKTAKE_STALE' USING ERRCODE='40001'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot.lot_counts) l WHERE l->'lotCode'=NEW.lot_allocation->'lotCode' AND l->'expiresOn'=NEW.lot_allocation->'expiresOn' AND (l->>'quantity')::numeric>=-NEW.quantity::numeric) THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.supply_counted_lot_issue_guard() FROM PUBLIC;
CREATE TRIGGER supply_lot_issue_guard BEFORE INSERT ON public.supply_movements FOR EACH ROW EXECUTE FUNCTION app.supply_counted_lot_issue_guard();
COMMIT;
