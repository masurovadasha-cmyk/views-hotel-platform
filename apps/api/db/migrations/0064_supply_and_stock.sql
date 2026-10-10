BEGIN;
-- Explicitly requested operational roles; no existing identity is promoted.
INSERT INTO roles(code,name) VALUES('procurement','Procurement'),('warehouse','Warehouse');
INSERT INTO permissions(code,description) VALUES('supply.read','Read scoped purchasing and stock'),('purchase.manage','Maintain catalog and purchase orders'),('stock.manage','Receive and issue physical stock');
INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r JOIN permissions p ON
 (r.code='procurement' AND p.code IN ('supply.read','purchase.manage')) OR (r.code='warehouse' AND p.code IN ('supply.read','stock.manage'));
CREATE TABLE supply_items(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,property_id uuid NOT NULL,
 sku text NOT NULL CHECK(sku ~ '^[A-Z0-9_-]{1,40}$'),name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
 unit text NOT NULL CHECK(unit IN ('piece','gram','millilitre')),
 FOREIGN KEY(organization_id,property_id) REFERENCES properties(organization_id,id),
 UNIQUE(organization_id,property_id,sku),UNIQUE(organization_id,property_id,id)
);
CREATE TABLE supply_orders(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,property_id uuid NOT NULL,
 reference text NOT NULL CHECK(length(reference) BETWEEN 1 AND 160),status text NOT NULL DEFAULT 'ordered' CHECK(status IN ('ordered','received')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(organization_id,property_id) REFERENCES properties(organization_id,id),UNIQUE(organization_id,property_id,id)
);
CREATE TABLE supply_order_lines(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,property_id uuid NOT NULL,order_id uuid NOT NULL,item_id uuid NOT NULL,
 quantity bigint NOT NULL CHECK(quantity>0),
 FOREIGN KEY(organization_id,property_id,order_id) REFERENCES supply_orders(organization_id,property_id,id),
 FOREIGN KEY(organization_id,property_id,item_id) REFERENCES supply_items(organization_id,property_id,id),
 UNIQUE(order_id,item_id),UNIQUE(organization_id,property_id,id)
);
CREATE TABLE supply_receipts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,property_id uuid NOT NULL,order_id uuid NOT NULL UNIQUE,
 actor_user_id uuid NOT NULL REFERENCES users(id),actor_membership_id uuid NOT NULL REFERENCES organization_memberships(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(organization_id,property_id,order_id) REFERENCES supply_orders(organization_id,property_id,id),UNIQUE(organization_id,property_id,id)
);
CREATE TABLE supply_balances(
 organization_id uuid NOT NULL,property_id uuid NOT NULL,item_id uuid PRIMARY KEY,quantity bigint NOT NULL CHECK(quantity>=0),
 FOREIGN KEY(organization_id,property_id,item_id) REFERENCES supply_items(organization_id,property_id,id)
);
CREATE TABLE supply_movements(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,property_id uuid NOT NULL,item_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('receipt','issue')),quantity bigint NOT NULL CHECK(quantity<>0),reference text NOT NULL CHECK(length(reference) BETWEEN 1 AND 160),
 receipt_id uuid,order_line_id uuid UNIQUE,actor_user_id uuid NOT NULL REFERENCES users(id),actor_membership_id uuid NOT NULL REFERENCES organization_memberships(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(organization_id,property_id,item_id) REFERENCES supply_items(organization_id,property_id,id),
 FOREIGN KEY(organization_id,property_id,receipt_id) REFERENCES supply_receipts(organization_id,property_id,id),
 FOREIGN KEY(organization_id,property_id,order_line_id) REFERENCES supply_order_lines(organization_id,property_id,id),
 CHECK((kind='receipt' AND quantity>0 AND receipt_id IS NOT NULL AND order_line_id IS NOT NULL) OR (kind='issue' AND quantity<0 AND receipt_id IS NULL AND order_line_id IS NULL))
);
CREATE TABLE supply_commands(
 organization_id uuid NOT NULL,property_id uuid NOT NULL,command_key uuid NOT NULL,permission_code text NOT NULL CHECK(permission_code IN ('purchase.manage','stock.manage')),
 actor_user_id uuid NOT NULL REFERENCES users(id),actor_membership_id uuid NOT NULL REFERENCES organization_memberships(id),payload jsonb NOT NULL,result jsonb NOT NULL,
 PRIMARY KEY(organization_id,command_key),FOREIGN KEY(organization_id,property_id) REFERENCES properties(organization_id,id)
);
CREATE INDEX supply_items_property_idx ON supply_items(organization_id,property_id,id);
CREATE INDEX supply_orders_property_idx ON supply_orders(organization_id,property_id,id);
CREATE INDEX supply_movements_property_idx ON supply_movements(organization_id,property_id,id);
CREATE FUNCTION app.supply_actor_check() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN IF NEW.actor_user_id IS DISTINCT FROM app.current_user_id() OR NEW.actor_membership_id IS DISTINCT FROM app.current_membership_id() THEN RAISE EXCEPTION 'SUPPLY_ACTOR_MISMATCH' USING ERRCODE='42501'; END IF; RETURN NEW; END $$;
CREATE FUNCTION app.supply_order_transition() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN IF OLD.status<>'ordered' OR NEW.status<>'received' OR (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') THEN RAISE EXCEPTION 'SUPPLY_ORDER_IMMUTABLE' USING ERRCODE='23514'; END IF; RETURN NEW; END $$;
CREATE TRIGGER supply_order_transition BEFORE UPDATE ON supply_orders FOR EACH ROW EXECUTE FUNCTION app.supply_order_transition();
CREATE FUNCTION app.supply_order_insert_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN IF NEW.status<>'ordered' THEN RAISE EXCEPTION 'SUPPLY_ORDER_INITIAL_STATE' USING ERRCODE='23514'; END IF; RETURN NEW; END $$;
CREATE TRIGGER supply_order_insert_guard BEFORE INSERT ON supply_orders FOR EACH ROW EXECUTE FUNCTION app.supply_order_insert_guard();
CREATE FUNCTION app.supply_order_line_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE current_status text;
BEGIN
 IF NOT app.registry_access(NEW.organization_id,NEW.property_id,'purchase.manage') THEN RAISE EXCEPTION 'SUPPLY_ACTOR_MISMATCH' USING ERRCODE='42501'; END IF;
 SELECT status INTO current_status FROM public.supply_orders WHERE id=NEW.order_id AND organization_id=NEW.organization_id AND property_id=NEW.property_id FOR UPDATE;
 IF current_status IS DISTINCT FROM 'ordered' OR EXISTS(SELECT 1 FROM public.supply_receipts WHERE order_id=NEW.order_id) THEN RAISE EXCEPTION 'SUPPLY_ORDER_IMMUTABLE' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.supply_order_line_guard() FROM PUBLIC;
CREATE TRIGGER supply_order_line_guard BEFORE INSERT ON supply_order_lines FOR EACH ROW EXECUTE FUNCTION app.supply_order_line_guard();
-- One item lock exists even before its first receipt. Balance is maintained only
-- by this narrowly authorized movement trigger, never client UPDATE/SUM logic.
CREATE FUNCTION app.supply_apply_movement() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE existing numeric; resulting numeric;
BEGIN
 IF NOT app.registry_access(NEW.organization_id,NEW.property_id,'stock.manage') OR NEW.actor_user_id IS DISTINCT FROM app.current_user_id() OR NEW.actor_membership_id IS DISTINCT FROM app.current_membership_id() THEN RAISE EXCEPTION 'SUPPLY_ACTOR_MISMATCH' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.supply_items WHERE id=NEW.item_id AND organization_id=NEW.organization_id AND property_id=NEW.property_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SUPPLY_ITEM_SCOPE' USING ERRCODE='23514'; END IF;
 IF NEW.kind='receipt' AND NOT EXISTS(SELECT 1 FROM public.supply_order_lines l JOIN public.supply_receipts r ON r.order_id=l.order_id WHERE l.id=NEW.order_line_id AND r.id=NEW.receipt_id AND l.item_id=NEW.item_id AND l.quantity=NEW.quantity AND l.organization_id=NEW.organization_id AND l.property_id=NEW.property_id) THEN RAISE EXCEPTION 'SUPPLY_RECEIPT_MISMATCH' USING ERRCODE='23514'; END IF;
 SELECT quantity INTO existing FROM public.supply_balances WHERE item_id=NEW.item_id;
 resulting=COALESCE(existing,0)+NEW.quantity::numeric;
 IF resulting<0 THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK' USING ERRCODE='23514'; END IF;
 IF resulting>9223372036854775807 THEN RAISE EXCEPTION 'STOCK_LIMIT_EXCEEDED' USING ERRCODE='23514'; END IF;
 INSERT INTO public.supply_balances(organization_id,property_id,item_id,quantity) VALUES(NEW.organization_id,NEW.property_id,NEW.item_id,resulting::bigint) ON CONFLICT(item_id) DO UPDATE SET quantity=EXCLUDED.quantity;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.supply_apply_movement() FROM PUBLIC;
CREATE TRIGGER supply_movement_apply BEFORE INSERT ON supply_movements FOR EACH ROW EXECUTE FUNCTION app.supply_apply_movement();
-- A receipt cannot commit partially, or mark an order received without movements.
CREATE FUNCTION app.supply_receipt_complete() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE received uuid; target uuid;
BEGIN
 IF TG_TABLE_NAME='supply_orders' THEN target=NEW.id; ELSE target=NEW.order_id; END IF;
 SELECT id INTO received FROM public.supply_receipts WHERE order_id=target;
 IF received IS NULL OR NOT EXISTS(SELECT 1 FROM public.supply_orders WHERE id=target AND status='received') OR NOT EXISTS(SELECT 1 FROM public.supply_order_lines WHERE order_id=target) OR EXISTS(SELECT 1 FROM public.supply_order_lines l WHERE l.order_id=target AND NOT EXISTS(SELECT 1 FROM public.supply_movements m WHERE m.order_line_id=l.id AND m.receipt_id=received AND m.quantity=l.quantity AND m.item_id=l.item_id)) THEN RAISE EXCEPTION 'SUPPLY_RECEIPT_INCOMPLETE' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION app.supply_receipt_complete() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER supply_receipt_complete AFTER INSERT ON supply_receipts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.supply_receipt_complete();
CREATE CONSTRAINT TRIGGER supply_order_complete AFTER UPDATE ON supply_orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.supply_receipt_complete();
DO $$ DECLARE tab text; perm text; BEGIN
 FOREACH tab IN ARRAY ARRAY['supply_items','supply_orders','supply_order_lines','supply_receipts','supply_balances','supply_movements','supply_commands'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab); EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING(app.registry_access(organization_id,property_id,''supply.read''))',tab||'_read',tab);
  IF tab<>'supply_balances' THEN
   perm=CASE WHEN tab IN ('supply_items','supply_orders','supply_order_lines') THEN 'purchase.manage' ELSE 'stock.manage' END;
   IF tab='supply_commands' THEN EXECUTE 'CREATE POLICY supply_commands_insert ON supply_commands FOR INSERT WITH CHECK(app.registry_access(organization_id,property_id,permission_code))';
   ELSE EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK(app.registry_access(organization_id,property_id,%L))',tab||'_insert',tab,perm); END IF;
  END IF;
  IF tab<>'supply_orders' AND tab<>'supply_balances' THEN EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION app.registry_append_only()',tab||'_immutable',tab); END IF;
 END LOOP;
END $$;
CREATE POLICY supply_orders_update ON supply_orders FOR UPDATE USING(app.registry_access(organization_id,property_id,'stock.manage')) WITH CHECK(app.registry_access(organization_id,property_id,'stock.manage'));
CREATE TRIGGER supply_receipt_actor BEFORE INSERT ON supply_receipts FOR EACH ROW EXECUTE FUNCTION app.supply_actor_check();
CREATE TRIGGER supply_command_actor BEFORE INSERT ON supply_commands FOR EACH ROW EXECUTE FUNCTION app.supply_actor_check();
COMMIT;
