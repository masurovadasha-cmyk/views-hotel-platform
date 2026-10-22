BEGIN;
-- Receipt metadata only; no backfill, balance mutation or FEFO allocation.
ALTER TABLE public.supply_receipt_lines ADD COLUMN lot_code text,ADD COLUMN expires_on date;
ALTER TABLE public.supply_receipt_lines ADD CONSTRAINT supply_receipt_lot_metadata CHECK (
 (lot_code IS NULL AND expires_on IS NULL) OR
 (lot_code IS NOT NULL AND expires_on IS NOT NULL AND length(lot_code) BETWEEN 1 AND 80
 AND lot_code=btrim(lot_code) AND lot_code !~ '[[:cntrl:]]'
 AND expires_on BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'));
COMMIT;
