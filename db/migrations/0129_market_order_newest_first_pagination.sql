BEGIN;
CREATE INDEX service_orders_market_reservation_created_idx ON public.service_orders(reservation_id,created_at DESC,id DESC) WHERE reservation_id IS NOT NULL;
CREATE INDEX service_orders_market_property_created_idx ON public.service_orders(organization_id,property_id,created_at DESC,id DESC);

CREATE OR REPLACE FUNCTION app.market_guest_list(session_hash text,reservation uuid,after_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid:=service_private.guest_user(session_hash); result jsonb;
BEGIN
 PERFORM 1 FROM public.reservations r JOIN public.guest_profiles g ON g.id=r.primary_guest_id AND g.organization_id=r.organization_id WHERE r.id=reservation AND g.user_id=who;
 IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT coalesce(jsonb_agg(service_private.market_receipt(o.id) ORDER BY o.created_at DESC,o.id DESC),'[]') INTO result FROM
 (SELECT so.id,so.created_at FROM public.service_orders so JOIN public.market_orders m ON m.order_id=so.id
  WHERE so.reservation_id=reservation AND (after_id IS NULL OR (so.created_at,so.id)<(
   SELECT cursor.created_at,cursor.id FROM public.service_orders cursor JOIN public.market_orders cm ON cm.order_id=cursor.id
   WHERE cursor.id=after_id AND cursor.reservation_id=reservation))
  ORDER BY so.created_at DESC,so.id DESC LIMIT 51) o;
 RETURN jsonb_build_object('items',result);
END $$;

CREATE OR REPLACE FUNCTION app.market_staff_list(session_hash text,property uuid,after_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid:=service_private.staff_user(session_hash); result jsonb; org uuid:=app.current_organization_id();
BEGIN
 IF NOT app.registry_access(org,property,'stock.manage') THEN RAISE EXCEPTION 'SERVICE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(service_private.market_receipt(o.id)||jsonb_build_object('unitCode',o.code) ORDER BY o.created_at DESC,o.id DESC),'[]') INTO result FROM
 (SELECT so.id,so.created_at,u.code FROM public.service_orders so JOIN public.market_orders m ON m.order_id=so.id
  JOIN public.reservations r ON r.id=so.reservation_id AND r.organization_id=so.organization_id AND r.property_id=so.property_id
  JOIN public.units u ON u.id=r.unit_id AND u.property_id=r.property_id
  WHERE so.organization_id=org AND so.property_id=property AND (after_id IS NULL OR (so.created_at,so.id)<(
   SELECT cursor.created_at,cursor.id FROM public.service_orders cursor JOIN public.market_orders cm ON cm.order_id=cursor.id
   WHERE cursor.id=after_id AND cursor.organization_id=org AND cursor.property_id=property))
  ORDER BY so.created_at DESC,so.id DESC LIMIT 51) o;
 RETURN jsonb_build_object('items',result);
END $$;

REVOKE ALL ON FUNCTION app.market_guest_list(text,uuid,uuid),app.market_staff_list(text,uuid,uuid) FROM PUBLIC;
COMMIT;
