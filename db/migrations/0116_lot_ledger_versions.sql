BEGIN;
CREATE TABLE public.supply_lot_ledger(
 movement_id uuid PRIMARY KEY REFERENCES public.supply_movements(id),organization_id uuid NOT NULL,property_id uuid NOT NULL,item_id uuid NOT NULL,
 source_snapshot_id uuid REFERENCES public.supply_stocktakes(id),status text NOT NULL CHECK(status IN ('reconciled','recount_required','not_initialized')),
 total_quantity bigint NOT NULL CHECK(total_quantity>=0),
 FOREIGN KEY(organization_id,property_id,item_id) REFERENCES public.supply_items(organization_id,property_id,id),UNIQUE(organization_id,property_id,movement_id)
);
CREATE TABLE public.supply_lot_ledger_lines(
 movement_id uuid NOT NULL,organization_id uuid NOT NULL,property_id uuid NOT NULL,lot_code text,expires_on date,quantity_after bigint NOT NULL CHECK(quantity_after>=0),
 FOREIGN KEY(organization_id,property_id,movement_id) REFERENCES public.supply_lot_ledger(organization_id,property_id,movement_id),
 UNIQUE NULLS NOT DISTINCT(movement_id,lot_code,expires_on)
);
CREATE INDEX supply_lot_ledger_item ON public.supply_lot_ledger(organization_id,property_id,item_id,movement_id);
DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['supply_lot_ledger','supply_lot_ledger_lines'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY lot_ledger_read ON public.%I FOR SELECT USING(app.registry_access(organization_id,property_id,''supply.read''))',t);
  EXECUTE format('CREATE TRIGGER lot_ledger_immutable BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION app.registry_append_only()',t);
 END LOOP;
END $$;
CREATE FUNCTION app.supply_record_lot_version() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p public.supply_lot_projections; total bigint;
BEGIN
 SELECT quantity INTO total FROM public.supply_balances WHERE item_id=NEW.item_id;
 SELECT * INTO p FROM public.supply_lot_projections WHERE item_id=NEW.item_id AND last_movement_id=NEW.id;
 INSERT INTO public.supply_lot_ledger VALUES(NEW.id,NEW.organization_id,NEW.property_id,NEW.item_id,p.source_snapshot_id,COALESCE(p.status,'not_initialized'),total);
 IF p.status='reconciled' THEN
  INSERT INTO public.supply_lot_ledger_lines SELECT NEW.id,NEW.organization_id,NEW.property_id,l->>'lotCode',(l->>'expiresOn')::date,(l->>'quantity')::bigint FROM jsonb_array_elements(p.lots) l;
  IF (SELECT sum(quantity_after)::numeric FROM public.supply_lot_ledger_lines WHERE movement_id=NEW.id) IS DISTINCT FROM total::numeric THEN RAISE EXCEPTION 'LOT_LEDGER_MISMATCH' USING ERRCODE='23514';END IF;
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION app.supply_record_lot_version() FROM PUBLIC;
-- Runs after the projection and revision triggers; the item lock still covers the transaction.
CREATE TRIGGER supply_z_lot_version AFTER INSERT ON public.supply_movements FOR EACH ROW EXECUTE FUNCTION app.supply_record_lot_version();
CREATE OR REPLACE FUNCTION app.supply_counted_lot_issue_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE snapshot public.supply_stocktakes; revision bigint;
BEGIN
 IF NEW.lot_allocation IS NULL THEN RETURN NEW; END IF;
 IF NEW.kind<>'issue' OR NEW.quantity>=0 OR jsonb_typeof(NEW.lot_allocation)<>'object' OR NOT(NEW.lot_allocation ?& ARRAY['snapshotId','lotCode','expiresOn']) OR (SELECT count(*) FROM jsonb_object_keys(NEW.lot_allocation))<>(CASE WHEN NEW.lot_allocation ? 'movementId' THEN 4 ELSE 3 END) THEN RAISE EXCEPTION 'LOT_ALLOCATION_INVALID' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM public.supply_items WHERE id=NEW.item_id AND organization_id=NEW.organization_id AND property_id=NEW.property_id FOR UPDATE;
 IF NEW.lot_allocation ? 'movementId' THEN
  IF NOT EXISTS(SELECT 1 FROM public.supply_lot_projections p JOIN public.supply_lot_ledger h ON h.movement_id=p.last_movement_id AND h.item_id=p.item_id AND h.status='reconciled' WHERE p.item_id=NEW.item_id AND p.organization_id=NEW.organization_id AND p.property_id=NEW.property_id AND p.status='reconciled' AND p.last_movement_id=(NEW.lot_allocation->>'movementId')::uuid AND p.source_snapshot_id=(NEW.lot_allocation->>'snapshotId')::uuid)
  THEN RAISE EXCEPTION 'STOCKTAKE_STALE' USING ERRCODE='40001';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.supply_lot_ledger_lines l WHERE l.movement_id=(NEW.lot_allocation->>'movementId')::uuid AND l.lot_code IS NOT DISTINCT FROM NEW.lot_allocation->>'lotCode' AND l.expires_on::text IS NOT DISTINCT FROM NEW.lot_allocation->>'expiresOn' AND l.quantity_after::numeric>=-NEW.quantity::numeric)
  THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK' USING ERRCODE='23514';END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO snapshot FROM public.supply_stocktakes WHERE id=(NEW.lot_allocation->>'snapshotId')::uuid AND organization_id=NEW.organization_id AND property_id=NEW.property_id AND item_id=NEW.item_id AND lot_counts IS NOT NULL;
 SELECT b.revision INTO revision FROM public.supply_balances b WHERE b.item_id=NEW.item_id;
 IF snapshot.id IS NULL OR revision IS DISTINCT FROM snapshot.expected_revision+1 THEN RAISE EXCEPTION 'STOCKTAKE_STALE' USING ERRCODE='40001'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot.lot_counts) l WHERE l->'lotCode'=NEW.lot_allocation->'lotCode' AND l->'expiresOn'=NEW.lot_allocation->'expiresOn' AND (l->>'quantity')::numeric>=-NEW.quantity::numeric) THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
COMMIT;
