BEGIN;
CREATE FUNCTION app.market_credit(session_hash text,oid uuid,key uuid,body jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid:=service_private.staff_user(session_hash);mid uuid:=app.current_membership_id();ord public.service_orders;m public.market_orders;entry public.folio_entries;f public.guest_folios;
 payload jsonb:=jsonb_build_object('kind','market_credit','orderId',oid,'membershipId',mid,'body',body);prior jsonb;result jsonb;credit_id uuid:=gen_random_uuid();amount bigint;credited numeric;
BEGIN
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM ARRAY['amountMinor','expectedRevision','reason']
 OR jsonb_typeof(body->'expectedRevision') IS DISTINCT FROM 'number' OR body->>'expectedRevision' !~ '^[1-9][0-9]*$'
 OR jsonb_typeof(body->'amountMinor') IS DISTINCT FROM 'string' OR body->>'amountMinor' !~ '^[1-9][0-9]{0,18}$'
 OR jsonb_typeof(body->'reason') IS DISTINCT FROM 'string' OR length(btrim(body->>'reason')) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'SERVICE_INPUT_INVALID' USING ERRCODE='22023';END IF;
 amount:=(body->>'amountMinor')::bigint;
 SELECT o.* INTO ord FROM public.service_orders o JOIN public.market_orders linked ON linked.order_id=o.id WHERE o.id=oid;
 IF ord.id IS NULL THEN RAISE EXCEPTION 'SERVICE_STAY_NOT_FOUND' USING ERRCODE='P0002';END IF;
 IF NOT app.registry_access(ord.organization_id,ord.property_id,'finance.manage') THEN RAISE EXCEPTION 'SERVICE_FORBIDDEN' USING ERRCODE='42501';END IF;
 prior:=service_private.service_command_replay(who,key,payload);IF prior IS NOT NULL THEN RETURN prior;END IF;
 PERFORM 1 FROM public.reservations WHERE id=ord.reservation_id FOR UPDATE;
 SELECT * INTO m FROM public.market_orders WHERE order_id=oid FOR UPDATE;
 PERFORM service_private.staff_user(session_hash);
 IF NOT app.registry_access(ord.organization_id,ord.property_id,'finance.manage') THEN RAISE EXCEPTION 'SERVICE_FORBIDDEN' USING ERRCODE='42501';END IF;
 IF m.revision IS DISTINCT FROM (body->>'expectedRevision')::integer THEN RAISE EXCEPTION 'SERVICE_REVISION_CHANGED' USING ERRCODE='23514';END IF;
 IF m.stage<>'completed' THEN RAISE EXCEPTION 'SERVICE_CREDIT_NOT_ALLOWED' USING ERRCODE='23514';END IF;
 SELECT * INTO entry FROM public.folio_entries WHERE id=m.folio_entry_id;
 SELECT * INTO f FROM public.guest_folios WHERE id=entry.folio_id FOR UPDATE;
 IF f.status IS DISTINCT FROM 'open' THEN RAISE EXCEPTION 'FOLIO_NOT_OPEN' USING ERRCODE='23514';END IF;
 IF entry.ledger_journal_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.folio_entries WHERE reversal_of=entry.id) THEN RAISE EXCEPTION 'SERVICE_CREDIT_NOT_ALLOWED' USING ERRCODE='23514';END IF;
 SELECT coalesce(sum(amount_minor::numeric),0) INTO credited FROM public.market_credits WHERE order_id=oid;
 IF credited+amount::numeric>entry.amount_minor::numeric THEN RAISE EXCEPTION 'SERVICE_CREDIT_LIMIT' USING ERRCODE='23514';END IF;
 INSERT INTO public.market_credits(id,organization_id,property_id,order_id,folio_id,original_entry_id,currency,amount_minor,reason)
 VALUES(credit_id,ord.organization_id,ord.property_id,oid,f.id,entry.id,ord.currency,amount,btrim(body->>'reason'));
 INSERT INTO public.folio_entries(id,organization_id,property_id,folio_id,currency,kind,amount_minor,label,source_type,source_id,idempotency_key,credit_of,policy_snapshot)
 VALUES(credit_id,ord.organization_id,ord.property_id,f.id,ord.currency,'credit',-amount,jsonb_build_object('ru',btrim(body->>'reason'),'uz',btrim(body->>'reason'),'en',btrim(body->>'reason')),'market_credit',credit_id,'market-credit:'||credit_id,entry.id,jsonb_build_object('orderId',oid,'mode','operational_credit_no_payment'));
 UPDATE public.market_orders SET revision=revision+1,updated_at=clock_timestamp() WHERE order_id=oid;
 result:=service_private.market_receipt(oid);
 PERFORM service_private.service_command_record(who,mid,key,payload,result,ord.organization_id,oid,'market.credited');RETURN result;
END $$;
CREATE FUNCTION app.market_finance_list(session_hash text,property uuid,after_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who uuid:=service_private.staff_user(session_hash);result jsonb;
BEGIN
 IF NOT app.registry_access(app.current_organization_id(),property,'finance.read') THEN RAISE EXCEPTION 'SERVICE_FORBIDDEN' USING ERRCODE='42501';END IF;
 SELECT coalesce(jsonb_agg(service_private.market_receipt(o.id)||jsonb_build_object('unitCode',o.code) ORDER BY o.id),'[]') INTO result FROM
 (SELECT o.id,u.code FROM public.service_orders o JOIN public.market_orders m ON m.order_id=o.id JOIN public.reservations r ON r.id=o.reservation_id LEFT JOIN public.units u ON u.id=r.unit_id AND u.property_id=r.property_id
 WHERE o.organization_id=app.current_organization_id() AND o.property_id=property AND m.stage='completed' AND (after_id IS NULL OR o.id>after_id) ORDER BY o.id LIMIT 51) o;
 RETURN jsonb_build_object('items',result);
END $$;
REVOKE ALL ON FUNCTION app.market_credit(text,uuid,uuid,jsonb),app.market_finance_list(text,uuid,uuid) FROM PUBLIC;
COMMIT;
