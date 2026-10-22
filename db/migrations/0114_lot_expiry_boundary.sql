BEGIN;
-- Owner-approved calendar-day policy; pure helper is testable without changing clocks.
CREATE FUNCTION app.lot_date_allowed(expires_on date,property_timezone text,at_time timestamptz) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT COALESCE(expires_on >= (at_time AT TIME ZONE property_timezone)::date,false) $$;
CREATE FUNCTION app.supply_lot_expiry_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE expires date; zone text;
BEGIN
 IF NEW.kind='issue' THEN expires:=(NEW.lot_allocation->>'expiresOn')::date;
 ELSIF NEW.kind='return' AND NEW.return_source_issue_id IS NOT NULL THEN
  SELECT (lot_allocation->>'expiresOn')::date INTO expires FROM public.supply_movements WHERE id=NEW.return_source_issue_id;
 ELSE RETURN NEW;END IF;
 -- Unknown provenance remains manual-only; no automatic allocation is introduced.
 IF expires IS NULL THEN RETURN NEW;END IF;
 SELECT timezone INTO zone FROM public.properties WHERE id=NEW.property_id AND organization_id=NEW.organization_id;
 IF NOT app.lot_date_allowed(expires,zone,clock_timestamp()) THEN
  RAISE EXCEPTION 'SERVICE_STOCK_UNAVAILABLE' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.supply_lot_expiry_guard() FROM PUBLIC;
CREATE TRIGGER supply_lot_expiry_guard BEFORE INSERT ON public.supply_movements FOR EACH ROW EXECUTE FUNCTION app.supply_lot_expiry_guard();
COMMIT;
