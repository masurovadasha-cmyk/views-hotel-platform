BEGIN;
CREATE OR REPLACE FUNCTION app.guard_service_order() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE reopen_owner name;
BEGIN
 SELECT pg_get_userbyid(p.proowner) INTO reopen_owner
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='service_private' AND p.proname='market_reopen_picking'
  AND p.pronargs=4 AND oidvectortypes(p.proargtypes)='text, uuid, uuid, jsonb'
 LIMIT 1;
 IF (to_jsonb(OLD)-'status') IS DISTINCT FROM (to_jsonb(NEW)-'status') OR NOT(
  OLD.status='requested' AND NEW.status IN ('accepted','cancelled') OR
  OLD.status='accepted' AND NEW.status IN ('in_progress','cancelled') OR
  OLD.status='in_progress' AND NEW.status='completed' OR
  OLD.status IN ('accepted','in_progress') AND NEW.status='requested'
   AND coalesce(current_user=reopen_owner,false)
   AND EXISTS(SELECT 1 FROM public.market_orders m WHERE m.order_id=OLD.id AND m.stage='reserved' AND m.checklist IS NULL)) THEN
  RAISE EXCEPTION 'SERVICE_ORDER_TRANSITION_INVALID' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
COMMIT;
