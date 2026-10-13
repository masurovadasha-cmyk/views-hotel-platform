BEGIN;
-- Read-only projection. It never authorizes an issue or replaces physical counts.
CREATE TABLE public.supply_lot_projections(
 item_id uuid PRIMARY KEY,organization_id uuid NOT NULL,property_id uuid NOT NULL,
 source_snapshot_id uuid NOT NULL REFERENCES public.supply_stocktakes(id),
 last_movement_id uuid NOT NULL REFERENCES public.supply_movements(id),
 status text NOT NULL CHECK(status IN ('reconciled','recount_required')),
 total_quantity bigint NOT NULL CHECK(total_quantity>=0),lots jsonb,updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(organization_id,property_id,item_id) REFERENCES public.supply_items(organization_id,property_id,id),
 CHECK((status='reconciled')=(lots IS NOT NULL)),CHECK(lots IS NULL OR jsonb_typeof(lots)='array')
);
ALTER TABLE public.supply_lot_projections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supply_lot_projections FORCE ROW LEVEL SECURITY;
CREATE POLICY supply_lot_projection_read ON public.supply_lot_projections FOR SELECT USING(app.registry_access(organization_id,property_id,'supply.read'));
CREATE FUNCTION app.supply_project_lots() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE state public.supply_lot_projections; counted jsonb; next_lots jsonb; code text; expiry text; total bigint; matched numeric; sum_lots numeric;
BEGIN
 -- Every movement already holds the stable item lock and has updated the SKU balance.
 SELECT quantity INTO total FROM public.supply_balances WHERE item_id=NEW.item_id;
 SELECT * INTO state FROM public.supply_lot_projections WHERE item_id=NEW.item_id FOR UPDATE;
 IF NEW.kind='adjustment' THEN SELECT lot_counts INTO counted FROM public.supply_stocktakes WHERE id=NEW.stocktake_id;END IF;
 IF counted IS NOT NULL THEN
  INSERT INTO public.supply_lot_projections(item_id,organization_id,property_id,source_snapshot_id,last_movement_id,status,total_quantity,lots)
  VALUES(NEW.item_id,NEW.organization_id,NEW.property_id,NEW.stocktake_id,NEW.id,'reconciled',total,counted)
  ON CONFLICT(item_id) DO UPDATE SET source_snapshot_id=EXCLUDED.source_snapshot_id,last_movement_id=EXCLUDED.last_movement_id,status='reconciled',total_quantity=EXCLUDED.total_quantity,lots=EXCLUDED.lots,updated_at=clock_timestamp();
  RETURN NULL;
 END IF;
 IF state.item_id IS NULL THEN RETURN NULL;END IF;
 next_lots:=state.lots;
 IF state.status='reconciled' THEN
  IF NEW.kind='adjustment' OR (NEW.kind='issue' AND NEW.lot_allocation IS NULL) THEN next_lots:=NULL;
  ELSE
   IF NEW.kind='receipt' THEN SELECT lot_code,expires_on::text INTO code,expiry FROM public.supply_receipt_lines WHERE receipt_id=NEW.receipt_id AND order_line_id=NEW.order_line_id;
   ELSIF NEW.kind='issue' THEN code:=NEW.lot_allocation->>'lotCode';expiry:=NEW.lot_allocation->>'expiresOn';
   ELSIF NEW.kind='return' AND NEW.return_source_issue_id IS NOT NULL THEN SELECT lot_allocation->>'lotCode',lot_allocation->>'expiresOn' INTO code,expiry FROM public.supply_movements WHERE id=NEW.return_source_issue_id;
   END IF;
   SELECT COALESCE(sum((l->>'quantity')::numeric),0) INTO matched FROM jsonb_array_elements(next_lots) l WHERE l->>'lotCode' IS NOT DISTINCT FROM code AND l->>'expiresOn' IS NOT DISTINCT FROM expiry;
   IF matched+NEW.quantity<0 THEN next_lots:=NULL;
   ELSE
    SELECT jsonb_agg(jsonb_build_object('lotCode',c,'expiresOn',e,'quantity',q::text) ORDER BY c NULLS FIRST,e NULLS FIRST),sum(q) INTO next_lots,sum_lots FROM (
     SELECT c,e,sum(q) q FROM (
      SELECT l->>'lotCode' c,l->>'expiresOn' e,(l->>'quantity')::numeric q FROM jsonb_array_elements(next_lots) l
      UNION ALL SELECT code,expiry,NEW.quantity::numeric
     ) entries GROUP BY c,e
    ) grouped;
    IF sum_lots IS DISTINCT FROM total::numeric THEN next_lots:=NULL;END IF;
   END IF;
  END IF;
 END IF;
 UPDATE public.supply_lot_projections SET last_movement_id=NEW.id,total_quantity=total,lots=next_lots,status=CASE WHEN next_lots IS NULL THEN 'recount_required' ELSE 'reconciled' END,updated_at=clock_timestamp() WHERE item_id=NEW.item_id;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION app.supply_project_lots() FROM PUBLIC;
CREATE TRIGGER supply_lot_projection AFTER INSERT ON public.supply_movements FOR EACH ROW EXECUTE FUNCTION app.supply_project_lots();
COMMIT;
