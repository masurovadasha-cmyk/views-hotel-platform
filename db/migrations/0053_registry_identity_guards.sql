BEGIN;
CREATE FUNCTION app.guard_folio_identity() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF OLD.status='closed' OR NEW.status<>'closed' OR
  (to_jsonb(OLD)-'status'-'closed_at') IS DISTINCT FROM (to_jsonb(NEW)-'status'-'closed_at') THEN
  RAISE EXCEPTION 'FOLIO_IMMUTABLE' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER folio_identity_guard BEFORE UPDATE ON guest_folios FOR EACH ROW EXECUTE FUNCTION app.guard_folio_identity();
CREATE FUNCTION app.guard_service_order() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF (to_jsonb(OLD)-'status') IS DISTINCT FROM (to_jsonb(NEW)-'status') OR NOT(
  OLD.status='requested' AND NEW.status IN ('accepted','cancelled') OR
  OLD.status='accepted' AND NEW.status IN ('in_progress','cancelled') OR
  OLD.status='in_progress' AND NEW.status='completed') THEN
  RAISE EXCEPTION 'SERVICE_ORDER_TRANSITION_INVALID' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER service_order_guard BEFORE UPDATE ON service_orders FOR EACH ROW EXECUTE FUNCTION app.guard_service_order();
COMMIT;
