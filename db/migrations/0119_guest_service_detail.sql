BEGIN;
-- Exact primary-key reads; current primary-guest ownership is checked with scope.
CREATE FUNCTION app.guest_service_detail(session_hash text,reservation uuid,kind text,target uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid:=service_private.guest_user(session_hash); result jsonb;
BEGIN
 IF kind IS NULL OR kind NOT IN ('cleaning','laundry','market','concierge') THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 IF kind='laundry' THEN
  SELECT service_private.laundry_receipt(i) INTO result FROM public.laundry_intakes i
  JOIN public.reservations r ON r.id=i.reservation_id AND r.organization_id=i.organization_id AND r.property_id=i.property_id
  JOIN public.guest_profiles g ON g.id=r.primary_guest_id AND g.organization_id=r.organization_id
  WHERE i.id=target AND r.id=reservation AND g.user_id=who;
 ELSE
  SELECT CASE kind
   WHEN 'cleaning' THEN jsonb_build_object('orderId',o.id,'name',o.snapshot->'name','status',o.status,'stage',t.stage,'revision',t.revision,'requestedFor',lower(t.scheduled_period),'currency',o.currency,'totalMinor',o.total_minor::text,
    'feedback',(SELECT jsonb_build_object('rating',f.rating,'comment',f.comment) FROM public.service_order_feedback f WHERE f.order_id=o.id AND f.author_user_id=who))
   WHEN 'market' THEN service_private.market_receipt(o.id)
   WHEN 'concierge' THEN service_private.concierge_receipt(o.id) END INTO result
  FROM public.service_orders o
  JOIN public.reservations r ON r.id=o.reservation_id AND r.organization_id=o.organization_id AND r.property_id=o.property_id
  JOIN public.guest_profiles g ON g.id=r.primary_guest_id AND g.organization_id=r.organization_id
  LEFT JOIN public.service_cleaning_tasks t ON kind='cleaning' AND t.order_id=o.id AND t.organization_id=o.organization_id AND t.property_id=o.property_id
  LEFT JOIN public.market_orders m ON kind='market' AND m.order_id=o.id AND m.organization_id=o.organization_id AND m.property_id=o.property_id
  LEFT JOIN public.concierge_requests c ON kind='concierge' AND c.order_id=o.id AND c.organization_id=o.organization_id AND c.property_id=o.property_id
  WHERE o.id=target AND r.id=reservation AND g.user_id=who AND
   (kind='cleaning' AND t.order_id IS NOT NULL OR kind='market' AND m.order_id IS NOT NULL OR kind='concierge' AND c.order_id IS NOT NULL);
 END IF;
 IF result IS NULL THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 -- Match the existing guest gateway line whitelist; never expose warehouse IDs.
 IF kind='market' THEN
  result:=jsonb_set(result,'{lines}',(SELECT coalesce(jsonb_agg(jsonb_build_object('serviceId',l->'serviceId','name',l->'name','quantity',l->'quantity','priceMinor',l->'priceMinor') ORDER BY n),'[]') FROM jsonb_array_elements(result->'lines') WITH ORDINALITY AS lines(l,n)));
  IF jsonb_typeof(result->'proposal')='object' THEN
   result:=jsonb_set(result,'{proposal}',jsonb_build_object('status',result#>'{proposal,status}','kind',result#>'{proposal,kind}','note',result#>'{proposal,note}','totalMinor',result#>'{proposal,totalMinor}','expiresAt',result#>'{proposal,expiresAt}',
    'lines',(SELECT coalesce(jsonb_agg(jsonb_build_object('serviceId',l->'serviceId','name',l->'name','quantity',l->'quantity','priceMinor',l->'priceMinor') ORDER BY n),'[]') FROM jsonb_array_elements(result#>'{proposal,lines}') WITH ORDINALITY AS lines(l,n))));
  END IF;
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION app.guest_service_detail(text,uuid,text,uuid) FROM PUBLIC;
COMMIT;
