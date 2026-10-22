BEGIN;
-- Reuse immutable stocktake provenance, scope, item locks and movement revision.
ALTER TABLE public.supply_stocktakes ADD COLUMN lot_counts jsonb;
CREATE FUNCTION app.valid_lot_count_snapshot(lots jsonb,total bigint) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE line jsonb; amount numeric:=0; code text; expiry text;
BEGIN
 IF jsonb_typeof(lots)<>'array' OR jsonb_array_length(lots) NOT BETWEEN 1 AND 20 THEN RETURN false; END IF;
 FOR line IN SELECT value FROM jsonb_array_elements(lots) LOOP
  IF jsonb_typeof(line)<>'object' OR NOT(line ?& ARRAY['lotCode','expiresOn','quantity']) OR (SELECT count(*) FROM jsonb_object_keys(line))<>3 THEN RETURN false; END IF;
  IF jsonb_typeof(line->'quantity')<>'string' OR (line->>'quantity') !~ '^(0|[1-9][0-9]{0,18})$' THEN RETURN false; END IF;
  amount:=amount+(line->>'quantity')::numeric;
  code:=line->>'lotCode';expiry:=line->>'expiresOn';
  IF code IS NULL THEN
   IF line->'lotCode'<>'null'::jsonb OR line->'expiresOn'<>'null'::jsonb THEN RETURN false; END IF;
  ELSE
   IF jsonb_typeof(line->'lotCode')<>'string' OR length(code) NOT BETWEEN 1 AND 80 OR code<>btrim(code) OR code ~ '[[:cntrl:]]' OR jsonb_typeof(line->'expiresOn') IS DISTINCT FROM 'string' OR expiry !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR left(expiry,4)='0000' OR to_char(expiry::date,'YYYY-MM-DD')<>expiry THEN RETURN false; END IF;
  END IF;
 END LOOP;
 RETURN amount=total AND (SELECT count(DISTINCT jsonb_build_array(value->'lotCode',value->'expiresOn')) FROM jsonb_array_elements(lots))=jsonb_array_length(lots);
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
ALTER TABLE public.supply_stocktakes ADD CONSTRAINT supply_lot_snapshot_valid CHECK(lot_counts IS NULL OR (counted_quantity=expected_quantity AND app.valid_lot_count_snapshot(lot_counts,counted_quantity)));
CREATE INDEX supply_lot_snapshot_latest_idx ON public.supply_stocktakes(organization_id,property_id,item_id,expected_revision DESC) WHERE lot_counts IS NOT NULL;
COMMIT;
