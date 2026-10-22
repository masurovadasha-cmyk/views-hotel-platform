BEGIN;
-- Version changes for every movement, including count observations with zero
-- adjustment, so receive+issue returning to the same quantity invalidates previews.
ALTER TABLE supply_balances ADD COLUMN revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0);
UPDATE supply_balances b SET revision=(SELECT count(*) FROM supply_movements m WHERE m.item_id=b.item_id);
CREATE TABLE supply_stocktakes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,property_id uuid NOT NULL,item_id uuid NOT NULL,
 expected_quantity bigint NOT NULL CHECK(expected_quantity>=0),counted_quantity bigint NOT NULL CHECK(counted_quantity>=0),
 expected_revision bigint NOT NULL CHECK(expected_revision>=0),reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 160),
 actor_user_id uuid NOT NULL REFERENCES users(id),actor_membership_id uuid NOT NULL REFERENCES organization_memberships(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(organization_id,property_id,item_id) REFERENCES supply_items(organization_id,property_id,id),
 UNIQUE(organization_id,property_id,id)
);
CREATE INDEX supply_stocktakes_item_idx ON supply_stocktakes(organization_id,property_id,item_id,created_at,id);
ALTER TABLE supply_stocktakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE supply_stocktakes FORCE ROW LEVEL SECURITY;
CREATE POLICY supply_stocktakes_read ON supply_stocktakes FOR SELECT USING(app.registry_access(organization_id,property_id,'supply.read'));
CREATE POLICY supply_stocktakes_insert ON supply_stocktakes FOR INSERT WITH CHECK(app.registry_access(organization_id,property_id,'stock.manage'));
CREATE TRIGGER supply_stocktakes_immutable BEFORE UPDATE OR DELETE ON supply_stocktakes FOR EACH ROW EXECUTE FUNCTION app.registry_append_only();
ALTER TABLE supply_movements ADD COLUMN stocktake_id uuid;
ALTER TABLE supply_movements ADD CONSTRAINT supply_movement_stocktake_fk FOREIGN KEY(organization_id,property_id,stocktake_id) REFERENCES supply_stocktakes(organization_id,property_id,id);
ALTER TABLE supply_movements ADD CONSTRAINT supply_movement_stocktake_unique UNIQUE(stocktake_id);
ALTER TABLE supply_movements DROP CONSTRAINT supply_movements_kind_check;
ALTER TABLE supply_movements ADD CONSTRAINT supply_movements_kind_check CHECK(kind IN ('receipt','issue','adjustment'));
ALTER TABLE supply_movements DROP CONSTRAINT supply_movements_quantity_check;
ALTER TABLE supply_movements ADD CONSTRAINT supply_movements_quantity_check CHECK(quantity<>0 OR kind='adjustment');
ALTER TABLE supply_movements DROP CONSTRAINT supply_movements_check;
ALTER TABLE supply_movements ADD CONSTRAINT supply_movements_check CHECK(
 (kind='receipt' AND quantity>0 AND receipt_id IS NOT NULL AND order_line_id IS NOT NULL AND stocktake_id IS NULL)
 OR (kind='issue' AND quantity<0 AND receipt_id IS NULL AND order_line_id IS NULL AND stocktake_id IS NULL)
 OR (kind='adjustment' AND receipt_id IS NULL AND order_line_id IS NULL AND stocktake_id IS NOT NULL));
CREATE FUNCTION app.supply_stocktake_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE balance bigint; version bigint;
BEGIN
 IF NOT app.registry_access(NEW.organization_id,NEW.property_id,'stock.manage') OR NEW.actor_user_id IS DISTINCT FROM app.current_user_id() OR NEW.actor_membership_id IS DISTINCT FROM app.current_membership_id() THEN RAISE EXCEPTION 'SUPPLY_ACTOR_MISMATCH' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.supply_items WHERE id=NEW.item_id AND organization_id=NEW.organization_id AND property_id=NEW.property_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SUPPLY_ITEM_SCOPE' USING ERRCODE='23514'; END IF;
 SELECT quantity,revision INTO balance,version FROM public.supply_balances WHERE item_id=NEW.item_id;
 IF NEW.expected_quantity IS DISTINCT FROM COALESCE(balance,0) OR NEW.expected_revision IS DISTINCT FROM COALESCE(version,0) THEN RAISE EXCEPTION 'STOCKTAKE_STALE' USING ERRCODE='40001'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.supply_stocktake_guard() FROM PUBLIC;
CREATE TRIGGER supply_stocktake_guard BEFORE INSERT ON supply_stocktakes FOR EACH ROW EXECUTE FUNCTION app.supply_stocktake_guard();
CREATE FUNCTION app.supply_adjustment_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE count_record public.supply_stocktakes; balance bigint; version bigint;
BEGIN
 IF NEW.kind<>'adjustment' THEN RETURN NEW; END IF;
 IF NOT app.registry_access(NEW.organization_id,NEW.property_id,'stock.manage') OR NEW.actor_user_id IS DISTINCT FROM app.current_user_id() OR NEW.actor_membership_id IS DISTINCT FROM app.current_membership_id() THEN RAISE EXCEPTION 'SUPPLY_ACTOR_MISMATCH' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.supply_items WHERE id=NEW.item_id AND organization_id=NEW.organization_id AND property_id=NEW.property_id FOR UPDATE;
 SELECT * INTO count_record FROM public.supply_stocktakes WHERE id=NEW.stocktake_id;
 IF count_record.id IS NULL OR count_record.organization_id IS DISTINCT FROM NEW.organization_id OR count_record.property_id IS DISTINCT FROM NEW.property_id OR count_record.item_id IS DISTINCT FROM NEW.item_id OR count_record.actor_user_id IS DISTINCT FROM NEW.actor_user_id OR count_record.actor_membership_id IS DISTINCT FROM NEW.actor_membership_id OR NEW.quantity::numeric IS DISTINCT FROM count_record.counted_quantity::numeric-count_record.expected_quantity::numeric OR NEW.reference IS DISTINCT FROM count_record.reason THEN RAISE EXCEPTION 'STOCKTAKE_ADJUSTMENT_MISMATCH' USING ERRCODE='23514'; END IF;
 SELECT quantity,revision INTO balance,version FROM public.supply_balances WHERE item_id=NEW.item_id;
 IF count_record.expected_quantity IS DISTINCT FROM COALESCE(balance,0) OR count_record.expected_revision IS DISTINCT FROM COALESCE(version,0) THEN RAISE EXCEPTION 'STOCKTAKE_STALE' USING ERRCODE='40001'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.supply_adjustment_guard() FROM PUBLIC;
-- Alphabetic order runs this before supply_movement_apply from 0066.
CREATE TRIGGER supply_adjustment_check BEFORE INSERT ON supply_movements FOR EACH ROW EXECUTE FUNCTION app.supply_adjustment_guard();
CREATE FUNCTION app.supply_revision_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 UPDATE public.supply_balances SET revision=revision+1 WHERE item_id=NEW.item_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'SUPPLY_BALANCE_MISSING' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION app.supply_revision_changed() FROM PUBLIC;
CREATE TRIGGER supply_revision_changed AFTER INSERT ON supply_movements FOR EACH ROW EXECUTE FUNCTION app.supply_revision_changed();
CREATE FUNCTION app.supply_stocktake_complete() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.supply_movements m WHERE m.stocktake_id=NEW.id AND m.kind='adjustment' AND m.item_id=NEW.item_id AND m.organization_id=NEW.organization_id AND m.property_id=NEW.property_id AND m.quantity::numeric=NEW.counted_quantity::numeric-NEW.expected_quantity::numeric) THEN RAISE EXCEPTION 'STOCKTAKE_INCOMPLETE' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION app.supply_stocktake_complete() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER supply_stocktake_complete AFTER INSERT ON supply_stocktakes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.supply_stocktake_complete();
COMMIT;
