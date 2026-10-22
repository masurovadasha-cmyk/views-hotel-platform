BEGIN;
-- Preserve historical full receipts and introduce immutable shipment manifests.
ALTER TABLE supply_orders DROP CONSTRAINT supply_orders_status_check;
ALTER TABLE supply_orders ADD CONSTRAINT supply_orders_status_check CHECK(status IN ('ordered','partially_received','received'));
ALTER TABLE supply_receipts DROP CONSTRAINT supply_receipts_order_id_key;
ALTER TABLE supply_movements DROP CONSTRAINT supply_movements_order_line_id_key;
CREATE UNIQUE INDEX supply_receipt_movement_line_idx ON supply_movements(receipt_id,order_line_id) WHERE kind='receipt';
CREATE INDEX supply_movements_order_line_idx ON supply_movements(order_line_id) WHERE kind='receipt';
CREATE INDEX supply_receipts_order_idx ON supply_receipts(order_id,id);
CREATE TABLE supply_receipt_lines(
 organization_id uuid NOT NULL,property_id uuid NOT NULL,receipt_id uuid NOT NULL,order_line_id uuid NOT NULL,quantity bigint NOT NULL CHECK(quantity>0),
 PRIMARY KEY(receipt_id,order_line_id),
 FOREIGN KEY(organization_id,property_id,receipt_id) REFERENCES supply_receipts(organization_id,property_id,id),
 FOREIGN KEY(organization_id,property_id,order_line_id) REFERENCES supply_order_lines(organization_id,property_id,id)
);
INSERT INTO supply_receipt_lines SELECT organization_id,property_id,receipt_id,order_line_id,quantity FROM supply_movements WHERE kind='receipt';
ALTER TABLE supply_receipt_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE supply_receipt_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY supply_receipt_lines_read ON supply_receipt_lines FOR SELECT USING(app.registry_access(organization_id,property_id,'supply.read'));
CREATE POLICY supply_receipt_lines_insert ON supply_receipt_lines FOR INSERT WITH CHECK(app.registry_access(organization_id,property_id,'stock.manage'));
CREATE TRIGGER supply_receipt_lines_immutable BEFORE UPDATE OR DELETE ON supply_receipt_lines FOR EACH ROW EXECUTE FUNCTION app.registry_append_only();
CREATE FUNCTION app.supply_receipt_line_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target uuid;
BEGIN
 IF NOT app.registry_access(NEW.organization_id,NEW.property_id,'stock.manage') THEN RAISE EXCEPTION 'SUPPLY_ACTOR_MISMATCH' USING ERRCODE='42501'; END IF;
 SELECT r.order_id INTO target FROM public.supply_receipts r JOIN public.supply_order_lines l ON l.order_id=r.order_id
 WHERE r.id=NEW.receipt_id AND l.id=NEW.order_line_id AND r.organization_id=NEW.organization_id AND r.property_id=NEW.property_id AND r.actor_user_id=app.current_user_id() AND r.actor_membership_id=app.current_membership_id();
 IF target IS NULL THEN RAISE EXCEPTION 'SUPPLY_RECEIPT_MISMATCH' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM public.supply_orders WHERE id=target AND status IN ('ordered','partially_received') FOR UPDATE;
 IF NOT FOUND OR EXISTS(SELECT 1 FROM public.supply_movements WHERE receipt_id=NEW.receipt_id) THEN RAISE EXCEPTION 'SUPPLY_RECEIPT_IMMUTABLE' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.supply_receipt_line_guard() FROM PUBLIC;
CREATE TRIGGER supply_receipt_line_guard BEFORE INSERT ON supply_receipt_lines FOR EACH ROW EXECUTE FUNCTION app.supply_receipt_line_guard();
CREATE OR REPLACE FUNCTION app.supply_order_transition() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF OLD.status NOT IN ('ordered','partially_received') OR NEW.status NOT IN ('partially_received','received') OR (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') THEN RAISE EXCEPTION 'SUPPLY_ORDER_IMMUTABLE' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION app.supply_apply_movement() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE existing numeric; resulting numeric; target uuid; ordered_quantity bigint; shipment_quantity bigint; received_quantity numeric;
BEGIN
 IF NOT app.registry_access(NEW.organization_id,NEW.property_id,'stock.manage') OR NEW.actor_user_id IS DISTINCT FROM app.current_user_id() OR NEW.actor_membership_id IS DISTINCT FROM app.current_membership_id() THEN RAISE EXCEPTION 'SUPPLY_ACTOR_MISMATCH' USING ERRCODE='42501'; END IF;
 IF NEW.kind='receipt' THEN
  SELECT r.order_id,l.quantity,d.quantity INTO target,ordered_quantity,shipment_quantity FROM public.supply_receipts r JOIN public.supply_order_lines l ON l.order_id=r.order_id JOIN public.supply_receipt_lines d ON d.receipt_id=r.id AND d.order_line_id=l.id
   WHERE r.id=NEW.receipt_id AND l.id=NEW.order_line_id AND l.item_id=NEW.item_id AND l.organization_id=NEW.organization_id AND l.property_id=NEW.property_id;
  IF target IS NULL OR shipment_quantity IS DISTINCT FROM NEW.quantity THEN RAISE EXCEPTION 'SUPPLY_RECEIPT_MISMATCH' USING ERRCODE='23514'; END IF;
  PERFORM 1 FROM public.supply_orders WHERE id=target AND status IN ('ordered','partially_received') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_ALREADY_RECEIVED' USING ERRCODE='23514'; END IF;
  SELECT COALESCE(sum(quantity),0) INTO received_quantity FROM public.supply_movements WHERE order_line_id=NEW.order_line_id AND kind='receipt';
  IF received_quantity+NEW.quantity::numeric>ordered_quantity THEN RAISE EXCEPTION 'RECEIPT_QUANTITY_EXCEEDED' USING ERRCODE='23514'; END IF;
 END IF;
 PERFORM 1 FROM public.supply_items WHERE id=NEW.item_id AND organization_id=NEW.organization_id AND property_id=NEW.property_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SUPPLY_ITEM_SCOPE' USING ERRCODE='23514'; END IF;
 SELECT quantity INTO existing FROM public.supply_balances WHERE item_id=NEW.item_id;
 resulting=COALESCE(existing,0)+NEW.quantity::numeric;
 IF resulting<0 THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK' USING ERRCODE='23514'; END IF;
 IF resulting>9223372036854775807 THEN RAISE EXCEPTION 'STOCK_LIMIT_EXCEEDED' USING ERRCODE='23514'; END IF;
 INSERT INTO public.supply_balances(organization_id,property_id,item_id,quantity) VALUES(NEW.organization_id,NEW.property_id,NEW.item_id,resulting::bigint) ON CONFLICT(item_id) DO UPDATE SET quantity=EXCLUDED.quantity;
 RETURN NEW;
END $$;
-- Every committed receipt matches its manifest; order progress derives from
-- receipts across all shipments, never from a client-provided status or balance.
CREATE OR REPLACE FUNCTION app.supply_receipt_complete() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target uuid; expected_status text; actual_status text;
BEGIN
 IF TG_TABLE_NAME='supply_orders' THEN target=NEW.id; ELSE target=NEW.order_id; END IF;
 SELECT status INTO actual_status FROM public.supply_orders WHERE id=target;
 IF NOT EXISTS(SELECT 1 FROM public.supply_order_lines WHERE order_id=target) OR NOT EXISTS(SELECT 1 FROM public.supply_receipts WHERE order_id=target)
  OR EXISTS(SELECT 1 FROM public.supply_receipts r WHERE r.order_id=target AND NOT EXISTS(SELECT 1 FROM public.supply_receipt_lines d WHERE d.receipt_id=r.id))
  OR EXISTS(SELECT 1 FROM public.supply_receipt_lines d JOIN public.supply_receipts r ON r.id=d.receipt_id WHERE r.order_id=target AND NOT EXISTS(SELECT 1 FROM public.supply_movements m WHERE m.receipt_id=d.receipt_id AND m.order_line_id=d.order_line_id AND m.kind='receipt' AND m.quantity=d.quantity))
  OR EXISTS(SELECT 1 FROM public.supply_order_lines l WHERE l.order_id=target AND (SELECT COALESCE(sum(m.quantity),0) FROM public.supply_movements m WHERE m.order_line_id=l.id AND m.kind='receipt')>l.quantity)
 THEN RAISE EXCEPTION 'SUPPLY_RECEIPT_INCOMPLETE' USING ERRCODE='23514'; END IF;
 SELECT CASE WHEN bool_and((SELECT COALESCE(sum(m.quantity),0) FROM public.supply_movements m WHERE m.order_line_id=l.id AND m.kind='receipt')=l.quantity) THEN 'received' ELSE 'partially_received' END INTO expected_status FROM public.supply_order_lines l WHERE l.order_id=target;
 IF actual_status IS DISTINCT FROM expected_status THEN RAISE EXCEPTION 'SUPPLY_RECEIPT_INCOMPLETE' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
COMMIT;
