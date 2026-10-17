BEGIN;
-- Foundation only: no runtime write policy or callable reservation command.
CREATE TABLE public.market_lot_reservations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,property_id uuid NOT NULL,order_id uuid NOT NULL,item_id uuid NOT NULL,
 movement_id uuid NOT NULL REFERENCES public.supply_lot_ledger(movement_id),
 lot_code text NOT NULL,expires_on date NOT NULL,quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 50),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),released_at timestamptz,
 FOREIGN KEY(organization_id,property_id,order_id) REFERENCES public.market_orders(organization_id,property_id,order_id),
 FOREIGN KEY(order_id,item_id) REFERENCES public.market_order_lines(order_id,item_id),
 FOREIGN KEY(organization_id,property_id,item_id) REFERENCES public.supply_items(organization_id,property_id,id),
 CHECK(released_at IS NULL OR released_at>=created_at)
);
CREATE UNIQUE INDEX market_lot_one_active_line ON public.market_lot_reservations(order_id,item_id) WHERE released_at IS NULL;
CREATE INDEX market_lot_active_item ON public.market_lot_reservations(item_id,lot_code,expires_on) WHERE released_at IS NULL;
ALTER TABLE public.market_lot_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_lot_reservations FORCE ROW LEVEL SECURITY;
CREATE POLICY market_lot_read ON public.market_lot_reservations FOR SELECT USING(app.registry_access(organization_id,property_id,'supply.read'));

CREATE FUNCTION app.market_lot_reserve_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE stage text; expected integer; available bigint; held bigint; zone text;
BEGIN
 IF current_user<>pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='public.market_lot_reservations'::regclass)) THEN
  RAISE EXCEPTION 'LOT_RESERVE_DISABLED' USING ERRCODE='42501';
 END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'LOT_RESERVE_IMMUTABLE' USING ERRCODE='23514';END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.released_at IS NOT NULL OR NEW.released_at IS NULL OR NEW.released_at>clock_timestamp()
   OR (to_jsonb(NEW)-'released_at') IS DISTINCT FROM (to_jsonb(OLD)-'released_at')
  THEN RAISE EXCEPTION 'LOT_RESERVE_IMMUTABLE' USING ERRCODE='23514';END IF;
  RETURN NEW;
 END IF;
 IF NEW.released_at IS NOT NULL THEN RAISE EXCEPTION 'LOT_RESERVE_IMMUTABLE' USING ERRCODE='23514';END IF;
 SELECT m.stage INTO stage FROM public.market_orders m WHERE m.order_id=NEW.order_id AND m.organization_id=NEW.organization_id AND m.property_id=NEW.property_id FOR UPDATE;
 IF stage IS NULL OR stage NOT IN ('reserved','picking','ready') THEN RAISE EXCEPTION 'LOT_RESERVE_ORDER' USING ERRCODE='23514';END IF;
 PERFORM 1 FROM public.supply_items WHERE id=NEW.item_id AND organization_id=NEW.organization_id AND property_id=NEW.property_id FOR UPDATE;
 SELECT quantity INTO expected FROM public.market_order_lines WHERE order_id=NEW.order_id AND item_id=NEW.item_id;
 IF expected IS DISTINCT FROM NEW.quantity THEN RAISE EXCEPTION 'LOT_RESERVE_QUANTITY' USING ERRCODE='23514';END IF;
 IF NEW.lot_code IS NULL OR NEW.expires_on IS NULL THEN RAISE EXCEPTION 'LOT_RESERVE_UNKNOWN' USING ERRCODE='23514';END IF;
 SELECT timezone INTO zone FROM public.properties WHERE id=NEW.property_id AND organization_id=NEW.organization_id;
 IF NOT app.lot_date_allowed(NEW.expires_on,zone,clock_timestamp()) THEN RAISE EXCEPTION 'LOT_RESERVE_EXPIRED' USING ERRCODE='23514';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.supply_lot_projections WHERE item_id=NEW.item_id AND status='reconciled' AND last_movement_id=NEW.movement_id)
 THEN RAISE EXCEPTION 'LOT_RESERVE_STALE' USING ERRCODE='40001';END IF;
 SELECT l.quantity_after INTO available FROM public.supply_lot_ledger_lines l JOIN public.supply_lot_ledger h ON h.movement_id=l.movement_id
 WHERE h.movement_id=NEW.movement_id AND h.item_id=NEW.item_id AND h.organization_id=NEW.organization_id AND h.property_id=NEW.property_id AND h.status='reconciled' AND l.lot_code=NEW.lot_code AND l.expires_on=NEW.expires_on;
 SELECT coalesce(sum(quantity),0) INTO held FROM public.market_lot_reservations WHERE item_id=NEW.item_id AND lot_code=NEW.lot_code AND expires_on=NEW.expires_on AND released_at IS NULL;
 IF available IS NULL OR held+NEW.quantity>available THEN RAISE EXCEPTION 'LOT_RESERVE_UNAVAILABLE' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER market_lot_reserve_guard BEFORE INSERT OR UPDATE OR DELETE ON public.market_lot_reservations FOR EACH ROW EXECUTE FUNCTION app.market_lot_reserve_guard();

CREATE FUNCTION app.market_lot_stock_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF EXISTS(
  SELECT 1 FROM public.market_lot_reservations r
  LEFT JOIN public.supply_lot_ledger h ON h.movement_id=NEW.id AND h.item_id=r.item_id AND h.status='reconciled'
  LEFT JOIN public.supply_lot_ledger_lines l ON l.movement_id=h.movement_id AND l.lot_code=r.lot_code AND l.expires_on=r.expires_on
  WHERE r.item_id=NEW.item_id AND r.released_at IS NULL
  GROUP BY r.lot_code,r.expires_on,l.quantity_after HAVING l.quantity_after IS NULL OR sum(r.quantity)>l.quantity_after
 ) THEN RAISE EXCEPTION 'LOT_RESERVE_UNAVAILABLE' USING ERRCODE='23514';END IF;
 RETURN NULL;
END $$;
-- After projection and ledger, in the same movement transaction and item lock.
CREATE TRIGGER supply_zz_lot_reserves AFTER INSERT ON public.supply_movements FOR EACH ROW EXECUTE FUNCTION app.market_lot_stock_guard();

CREATE FUNCTION app.market_lot_terminal_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.market_orders m JOIN public.market_lot_reservations r ON r.order_id=m.order_id WHERE m.order_id=NEW.order_id AND m.stage NOT IN ('reserved','picking','ready') AND r.released_at IS NULL)
 THEN RAISE EXCEPTION 'LOT_RESERVE_ACTIVE' USING ERRCODE='23514';END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER market_lot_terminal_guard AFTER UPDATE ON public.market_orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.market_lot_terminal_guard();
REVOKE ALL ON FUNCTION app.market_lot_reserve_guard(),app.market_lot_stock_guard(),app.market_lot_terminal_guard() FROM PUBLIC;
COMMIT;
