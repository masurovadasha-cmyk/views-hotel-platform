BEGIN;
CREATE FUNCTION app.concierge_order_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s text;
BEGIN
 SELECT stage INTO s FROM public.concierge_requests WHERE order_id=NEW.id;
 IF s IS NOT NULL AND (NEW.status='completed' AND s<>'closed' OR NEW.status='cancelled' AND s<>'cancelled' OR NEW.status='in_progress' AND s<>'closed') THEN
  RAISE EXCEPTION 'SERVICE_TRANSITION_INVALID' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER concierge_order_guard BEFORE UPDATE ON service_orders FOR EACH ROW EXECUTE FUNCTION app.concierge_order_guard();
REVOKE ALL ON FUNCTION app.concierge_order_guard() FROM PUBLIC;
COMMIT;
